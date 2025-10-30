import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedPatients = vi.hoisted(() => ({
  resolvePatientForQueueMock: vi.fn(),
  buildQueuePatientLinkMock: vi.fn(),
  normalizePatientFullNameMock: vi.fn()
}));

vi.mock('../patients', () => ({
  buildQueuePatientLink: mockedPatients.buildQueuePatientLinkMock,
  normalizePatientFullName: mockedPatients.normalizePatientFullNameMock,
  resolvePatientForQueue: mockedPatients.resolvePatientForQueueMock
}));

const {
  resolvePatientForQueueMock,
  buildQueuePatientLinkMock,
  normalizePatientFullNameMock
} = mockedPatients;

type MockResolverArgs = {
  patient: {
    phone: {
      normalized: string;
    };
  };
};

import {
    applyBackfill,
    buildBackfillPlan,
    type BackfillCliOptions
} from './patientResolverBackfill';

type TimestampLike = { toDate(): Date };

const makeTimestamp = (iso: string): TimestampLike => {
  return {
    toDate: () => new Date(iso)
  } as unknown as TimestampLike;
};

class PatientDoc {
  constructor(public readonly id: string, private payload: Record<string, unknown>) {}

  data(): Record<string, unknown> {
    return this.payload;
  }

  merge(update: Record<string, unknown>): void {
    Object.assign(this.payload, update);
  }

  replace(update: Record<string, unknown>): void {
    this.payload = { ...update };
  }
}

class PatientCollection {
  constructor(private readonly docs: PatientDoc[]) {}

  async get(): Promise<{ empty: boolean; docs: PatientDoc[] }> {
    return {
      empty: this.docs.length === 0,
      docs: this.docs
    };
  }

  doc(id: string): { set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> } {
    const target = this.docs.find((doc) => doc.id === id);
    if (!target) {
      throw new Error(`Patient doc ${id} not found in stub`);
    }
    return {
      set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
        if (options?.merge === false) {
          target.replace(data);
        } else {
          target.merge(data);
        }
      }
    };
  }
}

class QueueDoc {
  constructor(public readonly id: string, private readonly patients: PatientDoc[]) {}

  collection(name: string): PatientCollection {
    if (name !== 'patients') {
      throw new Error(`Unsupported collection ${name} in QueueDoc stub`);
    }
    return new PatientCollection(this.patients);
  }
}

class QueueCollection {
  constructor(private readonly queues: QueueDoc[]) {}

  async listDocuments(): Promise<QueueDoc[]> {
    return this.queues;
  }
}

class DoctorDoc {
  constructor(public readonly id: string, private readonly queues: QueueDoc[]) {}

  collection(name: string): QueueCollection {
    if (name !== 'queues') {
      throw new Error(`Unsupported collection ${name} in DoctorDoc stub`);
    }
    return new QueueCollection(this.queues);
  }
}

class DoctorCollection {
  constructor(private readonly doctors: DoctorDoc[]) {}

  async listDocuments(): Promise<DoctorDoc[]> {
    return this.doctors;
  }
}

class ClinicDoc {
  constructor(public readonly id: string, private readonly doctors: DoctorDoc[]) {}

  collection(name: string): DoctorCollection {
    if (name !== 'doctors') {
      throw new Error(`Unsupported collection ${name} in ClinicDoc stub`);
    }
    return new DoctorCollection(this.doctors);
  }
}

class ClinicCollection {
  private readonly map = new Map<string, ClinicDoc>();

  constructor(private readonly clinics: ClinicDoc[]) {
    for (const clinic of clinics) {
      this.map.set(clinic.id, clinic);
    }
  }

  doc(id: string): ClinicDoc {
    const existing = this.map.get(id);
    if (existing) {
      return existing;
    }
    const empty = new ClinicDoc(id, []);
    this.map.set(id, empty);
    return empty;
  }

  async listDocuments(): Promise<ClinicDoc[]> {
    return Array.from(this.map.values());
  }
}

class FirestoreStub {
  private readonly clinics: ClinicCollection;

  constructor(clinics: ClinicDoc[]) {
    this.clinics = new ClinicCollection(clinics);
  }

  collection(name: string): ClinicCollection {
    if (name !== 'clinics') {
      throw new Error(`Unsupported collection ${name} in Firestore stub`);
    }
    return this.clinics;
  }
}

const makeOptions = (overrides: Partial<BackfillCliOptions> = {}): BackfillCliOptions => ({
  clinicIds: [],
  includeQueues: [],
  batchSize: 200,
  limit: null,
  since: null,
  until: null,
  resumeToken: null,
  output: null,
  apply: false,
  confirm: false,
  ...overrides
});

describe('buildBackfillPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('PATIENT_PHONE_HASH_SECRET', 'unit-secret');
    normalizePatientFullNameMock.mockImplementation((value: string) => value.trim());
    buildQueuePatientLinkMock.mockImplementation((result: { patientId: string }) => ({ linkId: result.patientId }));
    resolvePatientForQueueMock.mockReset();
  });

  it('summarizes duplicate phone hashes and identity counts', async () => {
    const queue = new QueueDoc('queue-1', [
      new PatientDoc('p1', { phone: '9644830895', joinedAt: makeTimestamp('2025-10-28T10:00:00Z') }),
      new PatientDoc('p2', { phone: '9644830895', joinedAt: makeTimestamp('2025-10-28T11:00:00Z') }),
      new PatientDoc('p3', { phone: '9826023456', joinedAt: makeTimestamp('2025-10-28T12:00:00Z') })
    ]);
    const doctor = new DoctorDoc('doctor-1', [queue]);
    const clinic = new ClinicDoc('clinic-1', [doctor]);
    const firestore = new FirestoreStub([clinic]);

    const { plan, details } = await buildBackfillPlan(firestore as unknown as Firestore, makeOptions({ clinicIds: ['clinic-1'] }));

    expect(plan.clinicsDiscovered).toBe(1);
    expect(plan.queuesScanned).toBe(1);
    expect(plan.queuePatientsEvaluated).toBe(3);
    expect(plan.identitiesToCreate).toBe(2);
    expect(plan.linksToAttach).toBe(3);
    expect(plan.requiresManualReview).toBe(1);
    expect(details.duplicateGroups).toHaveLength(1);
    expect(details.duplicateGroups[0]?.count).toBe(2);
    expect(details.invalidPhones).toBe(0);
    expect(details.missingPhones).toBe(0);
    expect(details.limitReached).toBe(false);
  });

  it('honors the --limit parameter', async () => {
    const queue = new QueueDoc('queue-1', [
      new PatientDoc('p1', { phone: '9644830895', joinedAt: makeTimestamp('2025-10-28T10:00:00Z') }),
      new PatientDoc('p2', { phone: '9644830895', joinedAt: makeTimestamp('2025-10-28T11:00:00Z') }),
      new PatientDoc('p3', { phone: '9826023456', joinedAt: makeTimestamp('2025-10-28T12:00:00Z') })
    ]);
    const firestore = new FirestoreStub([new ClinicDoc('clinic-1', [new DoctorDoc('doctor-1', [queue])])]);

    const { plan, details } = await buildBackfillPlan(
      firestore as unknown as Firestore,
      makeOptions({ clinicIds: ['clinic-1'], limit: 2 })
    );

    expect(plan.queuePatientsEvaluated).toBe(2);
    expect(plan.linksToAttach).toBe(2);
    expect(plan.identitiesToCreate).toBe(1);
    expect(details.limitReached).toBe(true);
  });

  it('skips entries outside the date window and tracks invalid phones', async () => {
    const queue = new QueueDoc('queue-1', [
      new PatientDoc('p1', { phone: '9644830895', joinedAt: makeTimestamp('2025-10-20T10:00:00Z') }),
      new PatientDoc('p2', { phone: '111111', joinedAt: makeTimestamp('2025-10-20T11:00:00Z') }),
      new PatientDoc('p3', { phone: null, joinedAt: makeTimestamp('2025-10-20T12:00:00Z') })
    ]);
    const firestore = new FirestoreStub([new ClinicDoc('clinic-1', [new DoctorDoc('doctor-1', [queue])])]);

    const { plan, details } = await buildBackfillPlan(
      firestore as unknown as Firestore,
      makeOptions({ clinicIds: ['clinic-1'], since: new Date('2025-10-25T00:00:00Z'), until: new Date('2025-10-31T00:00:00Z') })
    );

    expect(plan.linksToAttach).toBe(0);
    expect(plan.identitiesToCreate).toBe(0);
    expect(details.skippedOutsideWindow).toBe(3);
    expect(details.invalidPhones).toBe(0);
    expect(details.missingPhones).toBe(0);

    const { details: invalidDetails } = await buildBackfillPlan(
      firestore as unknown as Firestore,
      makeOptions({ clinicIds: ['clinic-1'], since: null, until: null })
    );
    expect(invalidDetails.invalidPhones).toBe(1);
    expect(invalidDetails.missingPhones).toBe(1);
  });
});

describe('applyBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('PATIENT_PHONE_HASH_SECRET', 'unit-secret');
    normalizePatientFullNameMock.mockImplementation((value: string) => value.trim());
    buildQueuePatientLinkMock.mockImplementation((result: { patientId: string }) => ({ linkId: result.patientId }));
    resolvePatientForQueueMock.mockReset();
  });

  it('links unlinked patients and updates stats', async () => {
    resolvePatientForQueueMock.mockImplementation(async ({ patient }: MockResolverArgs) => ({
      patientId: `identity-${patient.phone.normalized}`,
      resolverVersion: 'test-v1',
      matchType: 'exact',
      confidence: 'high',
      requiresReview: false,
      metadataVersion: 'meta-v1',
      createdNewPatient: true,
      ambiguityEntryRef: null
    }));

    const patientA = new PatientDoc('p1', {
      name: 'Resolver Test Primary',
      phone: '9644830895',
      joinedAt: makeTimestamp('2025-10-28T10:00:00Z')
    });
    const patientB = new PatientDoc('p2', {
      name: 'Already Linked',
      phone: '9826023456',
      joinedAt: makeTimestamp('2025-10-28T10:05:00Z'),
      patientIdentityLink: { linkId: 'existing' }
    });

    const queue = new QueueDoc('queue-1', [patientA, patientB]);
    const clinic = new ClinicDoc('clinic-1', [new DoctorDoc('doctor-1', [queue])]);
    const firestore = new FirestoreStub([clinic]);

    const stats = await applyBackfill(firestore as unknown as Firestore, makeOptions({
      clinicIds: ['clinic-1'],
      apply: true,
      confirm: true,
      batchSize: 1
    }));

    expect(resolvePatientForQueueMock).toHaveBeenCalledTimes(1);
    expect(buildQueuePatientLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'identity-+919644830895',
        resolverVersion: 'test-v1',
        createdNewPatient: true
      })
    );

    expect(stats.processed).toBe(2);
    expect(stats.linked).toBe(1);
    expect(stats.alreadyLinked).toBe(1);
    expect(stats.createdPatients).toBe(1);
    expect(stats.requiresReview).toBe(0);
    expect(stats.lastResumeToken).toBe('clinic-1|doctor-1|queue-1|p2');

    expect(patientA.data().patientIdentityId).toBe('identity-+919644830895');
    expect(patientA.data().patientIdentityLink).toEqual({ linkId: 'identity-+919644830895' });
    expect(patientA.data().patientResolver).toMatchObject({
      version: 'test-v1',
      matchType: 'exact',
      confidence: 'high',
      requiresReview: false,
      metadataVersion: 'meta-v1',
      ambiguityId: null
    });
    expect(patientA.data().requiresPatientReview).toBe(false);
  });

  it('respects resume tokens when continuing a run', async () => {
    resolvePatientForQueueMock.mockImplementation(async ({ patient }: MockResolverArgs) => ({
      patientId: `identity-${patient.phone.normalized}`,
      resolverVersion: 'test-v1',
      matchType: 'exact',
      confidence: 'high',
      requiresReview: false,
      metadataVersion: 'meta-v1',
      createdNewPatient: false,
      ambiguityEntryRef: null
    }));

    const patientA = new PatientDoc('p1', {
      name: 'Resume Skip',
      phone: '9644830895',
      joinedAt: makeTimestamp('2025-10-28T10:00:00Z')
    });
    const patientB = new PatientDoc('p2', {
      name: 'Resume Target',
      phone: '9826023456',
      joinedAt: makeTimestamp('2025-10-28T10:05:00Z')
    });

    const queue = new QueueDoc('queue-1', [patientA, patientB]);
    const clinic = new ClinicDoc('clinic-1', [new DoctorDoc('doctor-1', [queue])]);
    const firestore = new FirestoreStub([clinic]);

    const stats = await applyBackfill(firestore as unknown as Firestore, makeOptions({
      clinicIds: ['clinic-1'],
      apply: true,
      confirm: true,
      resumeToken: 'clinic-1|doctor-1|queue-1|p1'
    }));

    expect(resolvePatientForQueueMock).toHaveBeenCalledTimes(1);
    expect(stats.processed).toBe(1);
    expect(stats.linked).toBe(1);
    expect(stats.lastResumeToken).toBe('clinic-1|doctor-1|queue-1|p2');
    expect(patientA.data().patientIdentityId).toBeUndefined();
    expect(patientB.data().patientIdentityId).toBe('identity-+919826023456');
  });

  it('records resolver failures without blocking remaining patients', async () => {
    resolvePatientForQueueMock.mockImplementationOnce(async () => {
      throw new Error('resolver exploded');
    });

    resolvePatientForQueueMock.mockImplementationOnce(async ({ patient }: MockResolverArgs) => ({
      patientId: `identity-${patient.phone.normalized}`,
      resolverVersion: 'test-v1',
      matchType: 'created',
      confidence: 'medium',
      requiresReview: true,
      metadataVersion: 'meta-v1',
      createdNewPatient: true,
      ambiguityEntryRef: null
    }));

    const patientA = new PatientDoc('p1', {
      name: 'First',
      phone: '9644830895',
      joinedAt: makeTimestamp('2025-10-28T10:00:00Z')
    });
    const patientB = new PatientDoc('p2', {
      name: 'Second',
      phone: '9826023456',
      joinedAt: makeTimestamp('2025-10-28T10:05:00Z')
    });

    const queue = new QueueDoc('queue-1', [patientA, patientB]);
    const clinic = new ClinicDoc('clinic-1', [new DoctorDoc('doctor-1', [queue])]);
    const firestore = new FirestoreStub([clinic]);

    const stats = await applyBackfill(firestore as unknown as Firestore, makeOptions({
      clinicIds: ['clinic-1'],
      apply: true,
      confirm: true
    }));

    expect(resolvePatientForQueueMock).toHaveBeenCalledTimes(2);
    expect(stats.processed).toBe(2);
    expect(stats.resolverErrors).toBe(1);
    expect(stats.linked).toBe(1);
    expect(stats.requiresReview).toBe(1);
    expect(stats.lastResumeToken).toBe('clinic-1|doctor-1|queue-1|p2');
    expect(patientA.data().patientIdentityId).toBeUndefined();
    expect(patientB.data().requiresPatientReview).toBe(true);
  });
});
