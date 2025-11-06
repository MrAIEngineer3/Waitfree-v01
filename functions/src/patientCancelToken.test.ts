import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { admin } from './firebaseAdmin';
import { __test__ } from './index';

const buildFirestoreMocks = (patientData: Record<string, any>) => {
  const patientDocRef = {
    get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ ...patientData }) }),
    set: vi.fn().mockResolvedValue(undefined)
  };

  const patientsCollection = {
    doc: vi.fn().mockReturnValue(patientDocRef)
  };

  const shareCodeDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        canonicalClinicId: callData.clinicId,
        status: 'active',
        disabled: false
      })
    })
  };

  const clinicSlugDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        canonicalClinicId: callData.clinicId,
        status: 'active',
        disabled: false
      })
    })
  };

  const clinicShareCodesCollection = {
    doc: vi.fn().mockImplementation((id: string) => {
      if (id === callData.clinicId.toUpperCase()) {
        return shareCodeDocRef;
      }
      return {
        get: vi.fn().mockResolvedValue({ exists: false })
      };
    })
  };

  const clinicSlugsCollection = {
    doc: vi.fn().mockImplementation((id: string) => {
      if (id.toLowerCase() === callData.clinicId.toLowerCase()) {
        return clinicSlugDocRef;
      }
      return {
        get: vi.fn().mockResolvedValue({ exists: false })
      };
    })
  };

  const queueDocRef = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'patients') {
        return patientsCollection;
      }
      throw new Error(`Unexpected sub-collection: ${name}`);
    })
  };

  const queuesCollection = {
    doc: vi.fn().mockReturnValue(queueDocRef)
  };

  const doctorDocRef = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'queues') {
        return queuesCollection;
      }
      throw new Error(`Unexpected sub-collection: ${name}`);
    })
  };

  const doctorsCollection = {
    doc: vi.fn().mockReturnValue(doctorDocRef)
  };

  const clinicDocRef = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'doctors') {
        return doctorsCollection;
      }
      throw new Error(`Unexpected sub-collection: ${name}`);
    })
  };

  const clinicsCollection = {
    doc: vi.fn().mockReturnValue(clinicDocRef)
  };

  const firestoreStub = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'clinicShareCodes') {
        return clinicShareCodesCollection;
      }
      if (name === 'clinicSlugs') {
        return clinicSlugsCollection;
      }
      if (name === 'clinics') {
        return clinicsCollection;
      }
      throw new Error(`Unexpected top-level collection: ${name}`);
    })
  };

  return {
    firestoreStub,
    patientDocRef
  };
};

const callData = {
  clinicId: 'clinic-123',
  doctorId: 'doctor-456',
  queueId: 'queue-789',
  patientId: 'patient-abc'
};

beforeEach(() => {
  __test__.resetDelegates();
});

afterEach(() => {
  vi.restoreAllMocks();
  __test__.resetDelegates();
});

describe('patientCancelTokenHandler', () => {
  it('successfully cancels a waiting patient with a valid token', async () => {
    const token = 'valid-token-value-with-sufficient-length-123';
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const patientData = {
      status: 'waiting',
      accessTokenHash: hashed,
      queueId: callData.queueId
    };

    const { firestoreStub, patientDocRef } = buildFirestoreMocks(patientData);
    vi.spyOn(admin, 'firestore').mockReturnValue(firestoreStub as any);

    const updateSpy = vi.fn().mockResolvedValue({ success: true });
    __test__.setUpdatePatientStatusForCancel(updateSpy as any);

    const result = await __test__.patientCancelTokenHandler({ ...callData, token }, {} as any);

    expect(result).toMatchObject({ success: true, status: 'cancelled' });
    expect(updateSpy).toHaveBeenCalledWith({
      ...callData,
      newStatus: 'cancelled'
    }, expect.any(Object));

    await vi.waitFor(() => {
      expect(patientDocRef.set).toHaveBeenCalledWith(expect.objectContaining({
        cancellation: expect.objectContaining({ cancelledBy: 'patient-self' })
      }), { merge: true });
    });
  });

  it('rejects when the token hash does not match', async () => {
    const patientData = {
      status: 'waiting',
      accessTokenHash: crypto.createHash('sha256').update('different').digest('hex'),
      queueId: callData.queueId
    };

    const { firestoreStub } = buildFirestoreMocks(patientData);
    vi.spyOn(admin, 'firestore').mockReturnValue(firestoreStub as any);

    const updateSpy = vi.fn();
    __test__.setUpdatePatientStatusForCancel(updateSpy as any);

    await expect(
      __test__.patientCancelTokenHandler({ ...callData, token: 'valid-token-value-with-sufficient-length-123' }, {} as any)
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
