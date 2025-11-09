import { beforeEach, describe, expect, it, vi } from 'vitest';
import { admin } from './firebaseAdmin';
import { __test__ } from './index';

type UserDoc = Record<string, unknown>;

const { ensureDebugAccess, ensureStaffAccess, clearUserAccessCache } = __test__;

const mockFirestoreUser = (data: UserDoc) => {
  const current: UserDoc = JSON.parse(JSON.stringify(data ?? {}));

  const get = vi.fn().mockImplementation(async () => ({
    exists: true,
    data: () => JSON.parse(JSON.stringify(current))
  }));

  const extractSegments = (fieldPath: unknown): string[] => {
    if (typeof fieldPath === 'string') {
      return fieldPath.split('.');
    }
    const candidates = [
      (fieldPath as any)?._segments,
      (fieldPath as any)?.segments,
      (fieldPath as any)?._path?.segments,
      (fieldPath as any)?._internalPath?.segments
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.map((segment: unknown) => String(segment));
      }
    }
    return [];
  };

  const extractArrayUnionElements = (value: unknown): string[] => {
    if (Array.isArray((value as any)?._elements)) {
      return (value as any)._elements.map((entry: unknown) => String(entry));
    }
    if (Array.isArray((value as any)?.elements)) {
      return (value as any).elements.map((entry: unknown) => String(entry));
    }
    return [];
  };

  const update = vi.fn().mockImplementation(async (fieldPath: unknown, value: unknown) => {
    const segments = extractSegments(fieldPath);

    if (segments.length === 2 && segments[0] === 'doctorAssignments') {
      const clinicId = segments[1];
      const elements: string[] = extractArrayUnionElements(value);

      const existingMap = (current.doctorAssignments as Record<string, unknown>) ?? {};
      const existingList = Array.isArray(existingMap[clinicId])
        ? (existingMap[clinicId] as unknown[]).map((entry) => String(entry))
        : [];

      const merged = new Set([...existingList, ...elements]);
      current.doctorAssignments = {
        ...existingMap,
        [clinicId]: Array.from(merged)
      };
      return;
    }

    throw new Error(`Unexpected update invocation for segments: ${segments.join('.')}`);
  });

  const set = vi.fn().mockImplementation(async (payload: UserDoc) => {
    const incomingAssignments = (payload?.doctorAssignments ?? {}) as Record<string, unknown>;
    const existingAssignments = (current.doctorAssignments as Record<string, unknown>) ?? {};

    current.doctorAssignments = {
      ...existingAssignments,
      ...incomingAssignments
    };
  });

  const doc = vi.fn().mockReturnValue({ get, update, set });
  const collection = vi.fn().mockImplementation((name: string) => {
    if (name === 'users') {
      return { doc } as any;
    }
    throw new Error(`Unexpected collection: ${name}`);
  });
  const firestore = vi.fn().mockReturnValue({ collection });
  vi.spyOn(admin, 'firestore').mockImplementation(firestore as unknown as typeof admin.firestore);

  (mockFirestoreUser as any).state = {
    current,
    get,
    update,
    set,
    doc,
    collection,
    firestore
  };
};

describe('debug access gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearUserAccessCache();
    delete process.env.ENABLE_DEBUG_ENDPOINTS;
    delete process.env.FUNCTIONS_EMULATOR;
    delete (mockFirestoreUser as any).state;
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
    delete (mockFirestoreUser as any).state;
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

  it('allows staff with explicit doctor assignment', async () => {
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';
    mockFirestoreUser({
      clinicId: 'clinicA',
      doctorId: 'doctorX',
      doctorAssignments: { clinicA: ['doctorB'] }
    });

    await expect(
      ensureStaffAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        { clinicId: 'clinicA', doctorId: 'doctorB', action: 'update' }
      )
    ).resolves.toBeUndefined();
  });

  it('auto-assigns doctor access when enabled', async () => {
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';
    mockFirestoreUser({
      clinicId: 'clinicA',
      doctorId: 'doctorX',
      doctorAssignments: {}
    });

    await expect(
      ensureStaffAccess(
        { auth: { uid: 'staff1', token: {} } } as any,
        { clinicId: 'clinicA', doctorId: 'doctorB', action: 'update', autoAssignDoctorAccess: true }
      )
    ).resolves.toBeUndefined();

    const state = (mockFirestoreUser as any).state as { current: UserDoc; update: ReturnType<typeof vi.fn> } | undefined;
    expect(state).toBeDefined();
    expect(state?.update).toHaveBeenCalledTimes(1);
    expect((state?.current?.doctorAssignments as Record<string, string[]>).clinicA).toContain('doctorB');
  });
});
