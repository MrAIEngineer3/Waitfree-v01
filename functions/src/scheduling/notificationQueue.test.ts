import { createHash } from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const serverTimestampStub = { __type: 'serverTimestamp' };
const makeIncrementStub = (value: number) => ({ __type: 'increment', value });

var firestoreMocks: { collection: ReturnType<typeof vi.fn>; runTransaction: ReturnType<typeof vi.fn> };

vi.mock('../firebaseAdmin', () => {
  firestoreMocks = {
    collection: vi.fn(),
    runTransaction: vi.fn()
  };

  return {
    admin: {
      firestore: vi.fn(() => firestoreMocks)
    }
  };
});

const getCollectionMock = () => firestoreMocks.collection;
const getRunTransactionMock = () => firestoreMocks.runTransaction;

vi.mock('../notifier', () => ({
  sendNotification: vi.fn()
}));

vi.mock('../settings/notificationPreferences', () => ({
  isNotificationEnabled: vi.fn()
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => serverTimestampStub),
    increment: vi.fn((value: number) => makeIncrementStub(value))
  }
}));

import {
  enqueueDoctorOnlineNotification,
  dispatchDoctorOnlineNotifications,
  shouldEnqueueForStatus
} from './notificationQueue';

import { sendNotification } from '../notifier';
import { isNotificationEnabled } from '../settings/notificationPreferences';
import { FieldValue } from 'firebase-admin/firestore';

const resetFirestoreMocks = () => {
  getCollectionMock().mockReset();
  getRunTransactionMock().mockReset();
  vi.mocked(FieldValue.serverTimestamp).mockClear();
  vi.mocked(FieldValue.increment).mockClear();
};

const wireClinicCollections = (availabilityCollection: any, doctorDocOverrides: Record<string, unknown> = {}) => {
  const doctorDoc = {
    collection: vi.fn((name: string) => {
      if (name === 'availabilityNotifications') {
        return availabilityCollection;
      }
      throw new Error(`Unexpected doctor sub-collection ${name}`);
    }),
    ...doctorDocOverrides
  };

  const doctorsCollection = {
    doc: vi.fn(() => doctorDoc)
  };

  const clinicDoc = {
    collection: vi.fn((name: string) => {
      if (name === 'doctors') {
        return doctorsCollection;
      }
      throw new Error(`Unexpected clinic sub-collection ${name}`);
    })
  };

  const clinicsCollection = {
    doc: vi.fn(() => clinicDoc)
  };

  getCollectionMock().mockImplementation((name: string) => {
    if (name === 'clinics') {
      return clinicsCollection;
    }
    throw new Error(`Unexpected top-level collection ${name}`);
  });

  return { doctorDoc, doctorsCollection, clinicDoc, clinicsCollection };
};

describe('notificationQueue', () => {
  beforeEach(() => {
    resetFirestoreMocks();
    vi.mocked(sendNotification).mockReset();
    vi.mocked(isNotificationEnabled).mockReset();
  });

  it('enqueues a new doctor notification with normalized phone numbers', async () => {
    const txGet = vi.fn().mockResolvedValue({ exists: false });
    const txSet = vi.fn();

  getRunTransactionMock().mockImplementation(async (fn: any) => fn({ get: txGet, set: txSet }));

    let capturedContactKey: string | null = null;
    const docRef = { id: 'pending-doc' };

    const availabilityCollection = {
      doc: vi.fn((key: string) => {
        capturedContactKey = key;
        return docRef;
      })
    };

    wireClinicCollections(availabilityCollection);

    const result = await enqueueDoctorOnlineNotification({
      clinicId: ' clinic ',
      doctorId: ' doctor ',
      phone: '9876543210',
      patientName: 'Jane',
      doctorName: 'Doctor Strange'
    });

    expect(result).toEqual({ alreadyQueued: false, status: 'pending' });
    expect(txGet).toHaveBeenCalledWith(docRef);
    expect(txSet).toHaveBeenCalledWith(
      docRef,
      expect.objectContaining({
        clinicId: 'clinic',
        doctorId: 'doctor',
        phone: '+919876543210',
        patientName: 'Jane',
        doctorName: 'Doctor Strange',
        source: 'patient-app'
      })
    );

    const expectedKey = createHash('sha256').update('whatsapp::+919876543210').digest('hex');
    expect(capturedContactKey).toBe(expectedKey);
  });

  it('marks existing pending notifications as already queued and merges updates', async () => {
    const docRef = { id: 'existing-doc' };
    const availabilityCollection = {
      doc: vi.fn(() => docRef)
    };

    wireClinicCollections(availabilityCollection);

    const existingData = { status: 'pending', patientName: 'Existing Patient', doctorName: 'Existing Doctor' };

    const txGet = vi.fn().mockResolvedValue({ exists: true, data: () => existingData });
    const txSet = vi.fn();

  getRunTransactionMock().mockImplementation(async (fn: any) => fn({ get: txGet, set: txSet }));

    const result = await enqueueDoctorOnlineNotification({
      clinicId: 'clinic',
      doctorId: 'doctor',
      phone: '+91 98765 43210',
      patientName: 'Updated Patient'
    });

    expect(result).toEqual({ alreadyQueued: true, status: 'pending' });
    expect(txSet).toHaveBeenCalledWith(
      docRef,
      expect.objectContaining({
        patientName: 'Updated Patient',
        doctorName: 'Existing Doctor',
        requestCount: expect.objectContaining({ __type: 'increment', value: 1 })
      }),
      { merge: true }
    );
  });

  it('returns zero attempted when notifications are disabled', async () => {
    const availabilityCollection = {
      where: vi.fn()
    };
    wireClinicCollections(availabilityCollection);

    vi.mocked(isNotificationEnabled).mockResolvedValue(false);

    const result = await dispatchDoctorOnlineNotifications({ clinicId: 'clinic', doctorId: 'doctor' });

    expect(result).toEqual({ attempted: 0, notified: 0 });
    expect(availabilityCollection.where).not.toHaveBeenCalled();
  });

  it('dispatches notifications for pending entries', async () => {
    const docSetOne = vi.fn();
    const docSetTwo = vi.fn();

    const queryDocs = [
      {
        data: () => ({ patientName: 'Alice', phone: '+919876543210', doctorName: 'Dr A' }),
        ref: { set: docSetOne }
      },
      {
        data: () => ({ patientName: 'Bob', phone: '+918888888888', doctorName: null }),
        ref: { set: docSetTwo }
      }
    ];

    const queryChain = {
      where: vi.fn(() => queryChain),
      orderBy: vi.fn(() => queryChain),
      limit: vi.fn(() => queryChain),
      get: vi.fn(async () => ({ empty: false, docs: queryDocs }))
    } as any;

    wireClinicCollections(queryChain);

    vi.mocked(isNotificationEnabled).mockResolvedValue(true);
    vi.mocked(sendNotification)
      .mockResolvedValueOnce({ ok: true, provider: 'debug-only' })
      .mockResolvedValueOnce({ ok: false, provider: 'twilio', error: 'twilio-error' });

    const result = await dispatchDoctorOnlineNotifications({ clinicId: 'clinic', doctorId: 'doctor', doctorName: 'Fallback Doc' });

    expect(result).toEqual({ attempted: 2, notified: 1 });
    expect(sendNotification).toHaveBeenNthCalledWith(1, {
      to: '+919876543210',
      type: 'doctor-online',
      payload: {
        name: 'Alice',
        clinicId: 'clinic',
        doctorId: 'doctor',
        doctorName: 'Dr A'
      }
    });
    expect(sendNotification).toHaveBeenNthCalledWith(2, {
      to: '+918888888888',
      type: 'doctor-online',
      payload: {
        name: 'Bob',
        clinicId: 'clinic',
        doctorId: 'doctor',
        doctorName: 'Fallback Doc'
      }
    });

    expect(docSetOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', notifiedAt: serverTimestampStub }),
      { merge: true }
    );
    expect(docSetTwo).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', lastError: 'twilio-error' }),
      { merge: true }
    );
  });

  it('shouldEnqueueForStatus returns true unless status is explicitly online', () => {
    expect(shouldEnqueueForStatus(null, {})).toBe(true);
    expect(shouldEnqueueForStatus({ online: false } as any, {})).toBe(true);
    expect(shouldEnqueueForStatus({ online: true } as any, {})).toBe(false);
  });
});
