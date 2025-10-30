import { describe, expect, it, vi } from 'vitest';

type PatientRecord = {
  id: string;
  status: 'waiting' | 'in-progress' | string;
  tokenNumber: number;
  notifications?: Record<string, boolean>;
  name?: string;
  phone?: string;
};

type EnvOptions = {
  queueExists?: boolean;
  queueData?: Record<string, unknown>;
  patients?: PatientRecord[];
};

type TransactionLike = {
  get: (ref: PatientRef) => Promise<FirestoreDocSnapshot>;
  set: (ref: PatientRef, data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
};

type FirestoreDocSnapshot = {
  exists: boolean;
  data: () => PatientRecord | Record<string, unknown> | undefined;
};

type PatientRef = {
  id: string;
  get: () => Promise<FirestoreDocSnapshot>;
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
};

type DeepRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  isNotificationEnabledMock: vi.fn()
}));

const deepClone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
};

const deepMerge = (target: DeepRecord, patch: DeepRecord): DeepRecord => {
  const result: DeepRecord = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(existing as DeepRecord, value as DeepRecord);
    } else {
      result[key] = deepClone(value as unknown as DeepRecord);
    }
  }
  return result;
};

const createFirestoreEnv = (options: EnvOptions = {}) => {
  const queueExists = options.queueExists !== false;
  const queueData = options.queueData ?? {};
  const patientMap = new Map<string, PatientRecord>();
  const patientRefs = new Map<string, PatientRef>();

  for (const record of options.patients ?? []) {
    patientMap.set(record.id, deepClone(record));
  }

  const getPatient = (id: string): PatientRecord | undefined => {
    const current = patientMap.get(id);
    return current ? deepClone(current) : undefined;
  };

  const setPatient = (id: string, data: Record<string, unknown>, merge = false) => {
    if (merge) {
      const base = (patientMap.get(id) ?? { id }) as DeepRecord;
      const merged = deepMerge(base, data);
      merged.id = id;
      patientMap.set(id, merged as PatientRecord);
      return;
    }
    const clone = deepClone(data) as DeepRecord;
    clone.id = id;
    patientMap.set(id, clone as PatientRecord);
  };

  const createPatientRef = (id: string): PatientRef => {
    if (patientRefs.has(id)) {
      return patientRefs.get(id)!;
    }

    const ref: PatientRef = {
      id,
      get: async () => {
        const data = getPatient(id);
        if (!data) {
          return { exists: false, data: () => undefined };
        }
        return {
          exists: true,
          data: () => deepClone(data)
        };
      },
      set: async (data, options) => {
        setPatient(id, data, options?.merge === true);
      }
    };

    patientRefs.set(id, ref);
    return ref;
  };

  const createPatientsCollection = () => ({
    where: vi.fn((_field: string, _op: string, statuses: string[]) => ({
      get: vi.fn(async () => ({
        docs: Array.from(patientMap.values())
          .filter((patient) => statuses.includes(patient.status))
          .map((patient) => ({
            id: patient.id,
            data: () => deepClone(patient)
          }))
      }))
    })),
    doc: vi.fn((id: string) => createPatientRef(id))
  });

  const queueRef = {
    get: vi.fn(async () => {
      if (!queueExists) {
        return { exists: false, data: () => undefined };
      }
      return {
        exists: true,
        data: () => deepClone(queueData)
      };
    }),
    collection: vi.fn((name: string) => {
      if (name === 'patients') {
        return createPatientsCollection();
      }
      throw new Error(`Unexpected queue sub-collection: ${name}`);
    })
  };

  const queuesCollection = {
    doc: vi.fn((_id: string) => queueRef)
  };

  const doctorDoc = {
    collection: vi.fn((name: string) => {
      if (name === 'queues') {
        return queuesCollection;
      }
      throw new Error(`Unexpected doctor sub-collection: ${name}`);
    })
  };

  const doctorsCollection = {
    doc: vi.fn((_id: string) => doctorDoc)
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
    doc: vi.fn((_id: string) => clinicDoc)
  };

  const firestore = {
    collection: vi.fn((name: string) => {
      if (name === 'clinics') {
        return clinicsCollection;
      }
      throw new Error(`Unexpected top-level collection: ${name}`);
    }),
    runTransaction: vi.fn(async (callback: (tx: TransactionLike) => unknown) => {
      const tx: TransactionLike = {
        get: async (ref: PatientRef) => ref.get(),
        set: async (ref: PatientRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          await ref.set(data, options);
        }
      };
      return callback(tx);
    })
  };

  return {
    firestore,
    queueRef,
    store: {
      getPatient,
      listPatients: () => Array.from(patientMap.values()).map((patient) => deepClone(patient))
    }
  };
};

const setup = async (options: EnvOptions = {}) => {
  vi.resetModules();
  mocks.sendNotificationMock.mockReset();
  mocks.isNotificationEnabledMock.mockReset();

  const env = createFirestoreEnv(options);

  vi.doMock('./firebaseAdmin', () => ({
    admin: {
      firestore: vi.fn(() => env.firestore)
    }
  }));

  vi.doMock('./notifier', () => ({
    sendNotification: mocks.sendNotificationMock
  }));

  vi.doMock('./settings/notificationPreferences', () => ({
    isNotificationEnabled: mocks.isNotificationEnabledMock
  }));

  const module = await import('./notificationEngine');

  return {
    env,
    recomputeQueueNotifications: module.recomputeQueueNotifications
  };
};

describe('recomputeQueueNotifications', () => {
  it('skips when the target queue document is missing', async () => {
    const { recomputeQueueNotifications } = await setup({ queueExists: false });

    const result = await recomputeQueueNotifications({ clinicId: 'clinic', doctorId: 'doctor', queueId: 'queue' });

    expect(result).toMatchObject({ skipped: true });
    expect(mocks.isNotificationEnabledMock).not.toHaveBeenCalled();
    expect(mocks.sendNotificationMock).not.toHaveBeenCalled();
  });

  it('skips processing when token update notifications are disabled', async () => {
    const { recomputeQueueNotifications } = await setup({ queueExists: true });

    mocks.isNotificationEnabledMock.mockResolvedValue(false);

    const outcome = await recomputeQueueNotifications({ clinicId: 'clinic', doctorId: 'doctor', queueId: 'main-queue' });

    expect(mocks.isNotificationEnabledMock).toHaveBeenCalledWith({
      clinicId: 'clinic',
      channel: 'whatsapp',
      event: 'tokenUpdates'
    });
    expect(outcome).toEqual({ skipped: true, reason: 'token-updates-disabled' });
    expect(mocks.sendNotificationMock).not.toHaveBeenCalled();
  });

  it('marks milestones and sends notifications for eligible patients', async () => {
    const patients: PatientRecord[] = [
      {
        id: 'p1',
        status: 'in-progress',
        tokenNumber: 1,
        name: 'In Progress',
        phone: '+911111111111'
      },
      {
        id: 'p2',
        status: 'waiting',
        tokenNumber: 2,
        name: 'Alice',
        phone: '+922222222222'
      },
      {
        id: 'p3',
        status: 'waiting',
        tokenNumber: 3,
        name: 'Bob',
        phone: '+933333333333',
        notifications: { pos3: true }
      }
    ];

    const { env, recomputeQueueNotifications } = await setup({
      queueExists: true,
      queueData: { metrics: { avgServiceMs: 600000 } },
      patients
    });

    mocks.isNotificationEnabledMock.mockResolvedValue(true);
    mocks.sendNotificationMock
      .mockResolvedValueOnce({ ok: true, provider: 'debug-only' })
      .mockRejectedValueOnce(new Error('twilio down'));

    const outcome = await recomputeQueueNotifications({ clinicId: 'clinic', doctorId: 'doctor', queueId: 'queue' });

    expect(outcome.evaluated).toBe(3);
    expect(outcome.sent).toBe(1);
    expect(mocks.sendNotificationMock).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = mocks.sendNotificationMock.mock.calls;
    expect(firstCall[0]).toMatchObject({
      to: '+911111111111',
      type: 'now',
      payload: expect.objectContaining({ milestone: 'now', patientsAhead: 0 })
    });
    expect(secondCall[0]).toMatchObject({
      to: '+922222222222',
      type: 'pos2',
      payload: expect.objectContaining({ milestone: 'pos2', patientsAhead: 1 })
    });

    const updatedP1 = env.store.getPatient('p1');
    const updatedP2 = env.store.getPatient('p2');
    const updatedP3 = env.store.getPatient('p3');

    expect(updatedP1?.notifications?.now).toBe(true);
    expect(updatedP2?.notifications?.pos2).toBe(true);
    expect(updatedP3?.notifications?.pos3).toBe(true);

    expect(env.firestore.runTransaction).toHaveBeenCalledTimes(2);
  });
});
