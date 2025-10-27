import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __test__ } from './index';
import { admin } from './firebaseAdmin';

type UserDoc = Record<string, unknown>;

const { ensureDebugAccess, ensureStaffAccess, clearUserAccessCache } = __test__;

const mockFirestoreUser = (data: UserDoc) => {
  const get = vi.fn().mockResolvedValue({ exists: true, data: () => data });
  const doc = vi.fn().mockReturnValue({ get });
  const collection = vi.fn().mockImplementation((name: string) => {
    if (name === 'users') {
      return { doc } as any;
    }
    throw new Error(`Unexpected collection: ${name}`);
  });
  const firestore = vi.fn().mockReturnValue({ collection });
  vi.spyOn(admin, 'firestore').mockImplementation(firestore as unknown as typeof admin.firestore);
};

describe('debug access gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearUserAccessCache();
    delete process.env.ENABLE_DEBUG_ENDPOINTS;
    delete process.env.FUNCTIONS_EMULATOR;
  });

  it('rejects debug call when flag disabled', async () => {
    mockFirestoreUser({ clinicId: 'clinicA', doctorId: 'doctorA' });
    await expect(
      ensureDebugAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        { clinicId: 'clinicA', doctorId: 'doctorA', action: 'debug' }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows debug call when flag enabled and staff has access', async () => {
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';
    mockFirestoreUser({ clinicId: 'clinicA', doctorId: 'doctorA' });

    await expect(
      ensureDebugAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        { clinicId: 'clinicA', doctorId: 'doctorA', action: 'debug' }
      )
    ).resolves.toBeUndefined();
  });

  it('rejects debug call when staff lacks doctor access', async () => {
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';
    mockFirestoreUser({ clinicId: 'clinicA', doctorId: 'doctorA' });

    await expect(
      ensureDebugAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        { clinicId: 'clinicA', doctorId: 'doctorB', action: 'debug' }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows unauthenticated debug call only when requireAuth=false', async () => {
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';
    await expect(ensureDebugAccess({} as any, null, false)).resolves.toBeUndefined();
  });

  it('allows debug call when emulator is running', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    mockFirestoreUser({ clinicId: 'clinicA', doctorId: 'doctorA' });

    await expect(
      ensureDebugAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        { clinicId: 'clinicA', doctorId: 'doctorA', action: 'debug' }
      )
    ).resolves.toBeUndefined();
  });
});

describe('staff access checks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearUserAccessCache();
    delete process.env.ENABLE_DEBUG_ENDPOINTS;
    delete process.env.FUNCTIONS_EMULATOR;
  });

  it('allows clinic admins without doctor assignment when override enabled', async () => {
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';
    mockFirestoreUser({
      clinicId: 'clinicA',
      doctorId: 'doctorX',
      roles: ['clinic-admin'],
      additionalClinicIds: ['clinicA']
    });

    await expect(
      ensureStaffAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        {
          clinicId: 'clinicA',
          doctorId: 'doctorB',
          action: 'update',
          allowClinicAdminWithoutDoctor: true
        }
      )
    ).resolves.toBeUndefined();
  });

  it('rejects when clinic admin override is not allowed', async () => {
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';
    mockFirestoreUser({
      clinicId: 'clinicA',
      doctorId: 'doctorX',
      roles: ['clinic-admin'],
      additionalClinicIds: ['clinicA']
    });

    await expect(
      ensureStaffAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        { clinicId: 'clinicA', doctorId: 'doctorB', action: 'update' }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
