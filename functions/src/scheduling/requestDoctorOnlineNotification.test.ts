import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const firestoreMocks = vi.hoisted(() => {
  const doctorGet = vi.fn();
  let clinicId: string | null = null;
  let doctorId: string | null = null;

  const doctorCollection = {
    doc: vi.fn((id: string) => {
      doctorId = id;
      return { get: doctorGet };
    })
  };

  const clinicsCollection = {
    doc: vi.fn((id: string) => {
      clinicId = id;
      return {
        collection: vi.fn((name: string) => {
          if (name === 'doctors') {
            return doctorCollection;
          }
          return { doc: vi.fn() };
        })
      };
    })
  };

  const firestore = vi.fn(() => ({
    collection: vi.fn((name: string) => {
      if (name === 'clinics') {
        return clinicsCollection;
      }
      return { doc: vi.fn() };
    })
  }));

  return {
    doctorGet,
    doctorCollection,
    clinicsCollection,
    firestore,
    getClinicId: () => clinicId,
    getDoctorId: () => doctorId,
    reset: () => {
      clinicId = null;
      doctorId = null;
    }
  };
});

vi.mock('../firebaseAdmin', () => ({
  admin: {
    firestore: firestoreMocks.firestore
  }
}));

import { createRequestDoctorOnlineNotificationHandler } from './requestDoctorOnlineNotification';
import type { DoctorAvailabilityResult } from './types';

type ClinicSettings = {
  manualCheckInRequired?: boolean;
  allowOfflineSignups?: boolean;
};

type AvailabilityOverrides = Partial<DoctorAvailabilityResult>;

class FakeHttpsError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const baseSettings: ClinicSettings = {
  manualCheckInRequired: false,
  allowOfflineSignups: false
};

const fakeLogger = {
  info: vi.fn(),
  error: vi.fn()
};

const loadClinicSchedulingSettings = vi.fn(async () => baseSettings);

const resolveDoctorAvailability = vi.fn(async (_input: {
  clinicId: string;
  doctorId: string;
  settings?: ClinicSettings;
}): Promise<DoctorAvailabilityResult> => {
  throw new Error('resolveDoctorAvailability mock not configured');
});

const shouldEnqueueForStatus = vi.fn(
  (_status: DoctorAvailabilityResult['realTimeStatus'] | null, _options: { settings?: ClinicSettings | null }) => true
);

const enqueueDoctorOnlineNotification = vi.fn(
  async (_input: {
    clinicId: string;
    doctorId: string;
    phone: string;
    patientName?: string | null;
    source?: 'patient-app' | 'staff';
    doctorName?: string | null;
  }): Promise<{ alreadyQueued: boolean; status: 'pending' | 'sent' }> => ({ alreadyQueued: false, status: 'pending' })
);

const buildHandler = () =>
  createRequestDoctorOnlineNotificationHandler({
    loadClinicSchedulingSettings,
    resolveDoctorAvailability,
    shouldEnqueueForStatus,
    enqueueDoctorOnlineNotification,
    logger: fakeLogger,
    HttpsError: FakeHttpsError
  });

const createAvailability = (overrides: AvailabilityOverrides): DoctorAvailabilityResult => ({
  clinicId: 'clinic',
  doctorId: 'doctor',
  status: 'UNAVAILABLE',
  layer: 'REALTIME_TOGGLE',
  reasonCode: 'REALTIME_OFFLINE',
  computedAt: new Date('2025-10-21T00:00:00.000Z'),
  message: 'Temporarily offline',
  realTimeStatus: {
    online: false,
    source: 'staff',
    note: null,
    updatedAt: Timestamp.fromDate(new Date('2025-10-21T00:00:00.000Z'))
  },
  debug: { sample: true },
  ...overrides
});

beforeEach(() => {
  firestoreMocks.reset();
  firestoreMocks.doctorGet.mockReset();
  firestoreMocks.doctorCollection.doc.mockClear();
  firestoreMocks.clinicsCollection.doc.mockClear();
  loadClinicSchedulingSettings.mockClear();
  resolveDoctorAvailability.mockClear();
  shouldEnqueueForStatus.mockClear();
  enqueueDoctorOnlineNotification.mockClear();
  fakeLogger.info.mockClear();
  fakeLogger.error.mockClear();
});

describe('createRequestDoctorOnlineNotificationHandler', () => {
  it('throws invalid-argument when clinicId, doctorId, or phone missing', async () => {
    const fn = buildHandler();
    await expect(fn({ clinicId: 'test', doctorId: 'doc' }, { auth: null } as any)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('throws not-found when doctor document missing', async () => {
    const fn = buildHandler();
    firestoreMocks.doctorGet.mockResolvedValueOnce({ exists: false });

    await expect(
      fn({ clinicId: 'clinic', doctorId: 'doctor', phone: '1234567890' }, { auth: null } as any)
    ).rejects.toMatchObject({ code: 'not-found' });

    expect(firestoreMocks.getClinicId()).toBe('clinic');
    expect(firestoreMocks.getDoctorId()).toBe('doctor');
  });

  it('returns alreadyOnline when availability status is AVAILABLE', async () => {
    const fn = buildHandler();
    firestoreMocks.doctorGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: 'Doctor Strange' })
    });

    resolveDoctorAvailability.mockResolvedValueOnce(
      createAvailability({
        status: 'AVAILABLE',
        layer: 'DEFAULT_ROTA',
        reasonCode: 'DEFAULT_AVAILABLE'
      })
    );

    const result = await fn(
      { clinicId: 'clinic', doctorId: 'doctor', phone: '1234567890' },
      { auth: null } as any
    );

    expect(result).toMatchObject({ success: false, alreadyOnline: true });
    expect(enqueueDoctorOnlineNotification).not.toHaveBeenCalled();
  });

  it('returns enqueueEligible false when patient cannot be queued', async () => {
    const fn = buildHandler();
    firestoreMocks.doctorGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: 'Doctor Strange' })
    });

    resolveDoctorAvailability.mockResolvedValueOnce(createAvailability({ status: 'UNAVAILABLE' }));
    shouldEnqueueForStatus.mockReturnValueOnce(false);

    const result = await fn(
      { clinicId: 'clinic', doctorId: 'doctor', phone: '1234567890' },
      { auth: null } as any
    );

    expect(result).toMatchObject({ success: false, enqueueEligible: false });
    expect(enqueueDoctorOnlineNotification).not.toHaveBeenCalled();
  });

  it('enqueues notification when eligible', async () => {
    const fn = buildHandler();
    firestoreMocks.doctorGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: 'Doctor Strange' })
    });

    resolveDoctorAvailability.mockResolvedValueOnce(
      createAvailability({
        status: 'UNAVAILABLE',
        realTimeStatus: {
          online: false,
          source: 'staff',
          note: null,
          updatedAt: Timestamp.fromDate(new Date('2025-10-21T05:00:00.000Z'))
        }
      })
    );
    shouldEnqueueForStatus.mockReturnValueOnce(true);
    enqueueDoctorOnlineNotification.mockResolvedValueOnce({ alreadyQueued: false, status: 'pending' });

    const result = await fn(
      { clinicId: 'clinic', doctorId: 'doctor', phone: ' 1234567890 ', patientName: ' Jane ' },
      { auth: null } as any
    );

    expect(result).toMatchObject({ success: true, alreadyQueued: false, status: 'pending' });
    expect(enqueueDoctorOnlineNotification).toHaveBeenCalledWith({
      clinicId: 'clinic',
      doctorId: 'doctor',
      phone: '1234567890',
      patientName: 'Jane',
      source: 'patient-app',
      doctorName: 'Doctor Strange'
    });
    expect(result.availability?.realTimeStatus?.updatedAt).toBe('2025-10-21T05:00:00.000Z');
  });

  it('uses staff source when context has auth and propagates enqueue errors', async () => {
    const fn = buildHandler();
    firestoreMocks.doctorGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: 'Doctor Strange' })
    });

    resolveDoctorAvailability.mockResolvedValueOnce(createAvailability({ status: 'UNAVAILABLE' }));
    shouldEnqueueForStatus.mockReturnValueOnce(true);
    enqueueDoctorOnlineNotification.mockRejectedValueOnce(new Error('firestore down'));

    await expect(
      fn({ clinicId: 'clinic', doctorId: 'doctor', phone: '1234567890' }, { auth: { uid: 'staff' } } as any)
    ).rejects.toMatchObject({ code: 'internal' });

    expect(enqueueDoctorOnlineNotification).toHaveBeenCalledWith({
      clinicId: 'clinic',
      doctorId: 'doctor',
      phone: '1234567890',
      patientName: null,
      source: 'staff',
      doctorName: 'Doctor Strange'
    });
    expect(fakeLogger.error).toHaveBeenCalled();
  });
});
