import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const schedulingMocks = vi.hoisted(() => ({
  loadDoctorSchedulingSnapshot: vi.fn(),
  loadClinicSchedulingSettings: vi.fn()
}));

vi.mock('./firestore', () => ({
  loadDoctorSchedulingSnapshot: schedulingMocks.loadDoctorSchedulingSnapshot
}));

vi.mock('./settings', () => ({
  loadClinicSchedulingSettings: schedulingMocks.loadClinicSchedulingSettings
}));

import { resolveDoctorAvailability } from './availability';

type Snapshot = {
  document: {
    defaultRota?: any;
    realTimeStatus?: any;
  };
  overrides: any[];
};

const baseSettings = {
  manualCheckInRequired: false,
  allowOfflineSignups: false
};

const createSnapshot = (partial: Partial<Snapshot>): Snapshot => ({
  document: {
    defaultRota: null,
    realTimeStatus: null,
    ...(partial.document ?? {})
  },
  overrides: [],
  ...(partial.overrides ? { overrides: partial.overrides } : {})
});

const referenceDate = new Date('2025-10-20T04:00:00.000Z');

beforeEach(() => {
  schedulingMocks.loadDoctorSchedulingSnapshot.mockReset();
  schedulingMocks.loadClinicSchedulingSettings.mockReset();
});

describe('resolveDoctorAvailability', () => {
  it('returns REALTIME_OFFLINE when toggle is off', async () => {
    schedulingMocks.loadDoctorSchedulingSnapshot.mockResolvedValueOnce(
      createSnapshot({
        document: {
          realTimeStatus: { online: false, updatedAt: Timestamp.fromDate(new Date('2025-10-20T03:00:00.000Z')) }
        }
      })
    );

    const result = await resolveDoctorAvailability({
      clinicId: 'clinic',
      doctorId: 'doctor',
      reference: referenceDate,
      settings: baseSettings
    });

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.reasonCode).toBe('REALTIME_OFFLINE');
    expect(result.layer).toBe('REALTIME_TOGGLE');
  });

  it('prefers schedule when default rota reports available', async () => {
    schedulingMocks.loadDoctorSchedulingSnapshot.mockResolvedValueOnce(
      createSnapshot({
        document: {
          realTimeStatus: { online: true, updatedAt: Timestamp.fromDate(new Date('2025-10-20T03:00:00.000Z')) },
          defaultRota: {
            timeZone: 'Asia/Kolkata',
            week: {
              monday: [
                { start: '10:00', end: '18:00' }
              ]
            }
          }
        }
      })
    );

    const insideShiftReference = new Date('2025-10-20T07:30:00.000Z'); // 13:00 local

    const result = await resolveDoctorAvailability({
      clinicId: 'clinic',
      doctorId: 'doctor',
      reference: insideShiftReference,
      settings: baseSettings
    });

    expect(result.status).toBe('AVAILABLE');
    expect(result.layer).toBe('DEFAULT_ROTA');
    expect(result.reasonCode).toBe('DEFAULT_AVAILABLE');
    expect(result.realTimeStatus?.online).toBe(true);
    expect(result.debug?.manualCheckInRequired).toBe(false);
  });

  it('overrides schedule when toggle is on but rota is offline', async () => {
    schedulingMocks.loadDoctorSchedulingSnapshot.mockResolvedValueOnce(
      createSnapshot({
        document: {
          realTimeStatus: { online: true, updatedAt: Timestamp.fromDate(new Date('2025-10-20T03:00:00.000Z')) },
          defaultRota: {
            timeZone: 'Asia/Kolkata',
            week: {
              monday: [
                { start: '10:00', end: '18:00' }
              ]
            }
          }
        }
      })
    );

    const beforeShiftReference = new Date('2025-10-20T02:30:00.000Z'); // 08:00 local

    const result = await resolveDoctorAvailability({
      clinicId: 'clinic',
      doctorId: 'doctor',
      reference: beforeShiftReference,
      settings: baseSettings
    });

    expect(result.status).toBe('AVAILABLE');
    expect(result.layer).toBe('REALTIME_TOGGLE');
    expect(result.reasonCode).toBe('REALTIME_AVAILABLE');
    expect(result.debug).toMatchObject({ realTimeOverride: true });
  });
});
