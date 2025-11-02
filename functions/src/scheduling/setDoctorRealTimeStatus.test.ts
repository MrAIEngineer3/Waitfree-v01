import { describe, expect, it, vi } from 'vitest';

const serverTimestampStub = { __type: 'serverTimestamp' };

const deepClone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
};

const deepMerge = (target: Record<string, unknown> | undefined, patch: Record<string, unknown>): Record<string, unknown> => {
  const base = target ? deepClone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (base as Record<string, unknown>)[key] === 'object' &&
      (base as Record<string, unknown>)[key] !== null &&
      !Array.isArray((base as Record<string, unknown>)[key])
    ) {
      (base as Record<string, unknown>)[key] = deepMerge(
        (base as Record<string, unknown>)[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      (base as Record<string, unknown>)[key] = value;
    }
  }
  return base;
};

const createDocRef = (initialData?: Record<string, unknown>) => {
  const ref = {
    _data: deepClone(initialData ?? {}),
    get: vi.fn(async () => ({ exists: true, data: () => deepClone(ref._data) })),
    collection: vi.fn(),
    _applySet: (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      ref._data = options?.merge ? deepMerge(ref._data, data) : deepClone(data);
    }
  };
  return ref;
};

const createFirestoreEnv = (initialDoctorState?: Record<string, unknown>) => {
  const doctorDoc = createDocRef(initialDoctorState);

  const doctorsCollection = {
    doc: vi.fn(() => doctorDoc)
  };

  const clinicDoc = {
    collection: vi.fn((name: string) => {
      if (name === 'doctors') {
        return doctorsCollection;
      }
      throw new Error(`Unexpected clinic sub-collection: ${name}`);
    })
  };

  const clinicsCollection = {
    doc: vi.fn(() => clinicDoc)
  };

  const firestore = {
    collection: vi.fn((name: string) => {
      if (name === 'clinics') {
        return clinicsCollection;
      }
      throw new Error(`Unexpected top-level collection: ${name}`);
    }),
    runTransaction: vi.fn(async (callback: (tx: { get: typeof doctorDoc.get; set: (ref: typeof doctorDoc, data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> }) => unknown) => {
      const tx = {
        get: vi.fn(async (ref: typeof doctorDoc) => ref.get()),
        set: vi.fn(async (ref: typeof doctorDoc, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          ref._applySet(data, options);
        })
      };
      return callback(tx);
    })
  };

  return { firestore, doctorDoc };
};

const setup = async (initialDoctorState?: Record<string, unknown>) => {
  vi.resetModules();

  const serverTimestampMock = vi.fn(() => serverTimestampStub);
  const env = createFirestoreEnv(initialDoctorState);

  vi.doMock('firebase-admin/firestore', () => ({
    FieldValue: {
      serverTimestamp: serverTimestampMock
    }
  }));

  vi.doMock('../firebaseAdmin', () => ({
    admin: {
      firestore: vi.fn(() => env.firestore)
    }
  }));

  const module = await import('./mutations');

  return {
    env,
    serverTimestampMock,
    ...module
  };
};

const buildLongString = (length: number) => 'x'.repeat(length);

describe('setDoctorRealTimeStatus', () => {
  it('throws a ValidationError when clinicId is missing', async () => {
    const { setDoctorRealTimeStatus, ValidationError } = await setup();

    await expect(
      setDoctorRealTimeStatus({ clinicId: '', doctorId: 'doctor', online: true })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('normalises the note and source before persisting', async () => {
    const { setDoctorRealTimeStatus, env, serverTimestampMock } = await setup();
    const longNote = buildLongString(400);

    const result = await setDoctorRealTimeStatus({
      clinicId: 'clinicA',
      doctorId: 'doctorA',
      online: true,
      note: longNote,
      source: 'unknown'
    });

    expect(serverTimestampMock).toHaveBeenCalled();
    expect(result.updatedStatus.note).toHaveLength(280);
    expect(result.updatedStatus.source).toBe('staff');
    expect(result.changed).toBe(true);
    expect(env.doctorDoc._data?.scheduling).toBeDefined();
    expect(
      (env.doctorDoc._data?.scheduling as Record<string, any>).realTimeStatus.note
    ).toHaveLength(280);
  });

  it('preserves previous status metadata and detects unchanged toggles', async () => {
    const initialState = {
      scheduling: {
        realTimeStatus: {
          online: true,
          note: 'Existing note',
          source: 'automation',
          updatedAt: { __type: 'prev' }
        }
      }
    };

    const { setDoctorRealTimeStatus } = await setup(initialState);

    const outcome = await setDoctorRealTimeStatus({
      clinicId: 'clinicB',
      doctorId: 'doctorB',
      online: true,
      note: 'Short note',
      source: 'automation'
    });

    expect(outcome.previousStatus?.online).toBe(true);
    expect(outcome.updatedStatus.source).toBe('automation');
    expect(outcome.updatedStatus.note).toBe('Short note');
    expect(outcome.changed).toBe(false);
  });
});
