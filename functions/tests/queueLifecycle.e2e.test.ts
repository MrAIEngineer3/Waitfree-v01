import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

import { admin } from '../src/firebaseAdmin';
import {
  TEST_TIMEOUT_MS,
  callCallable,
  disposeFirebaseApp,
  signInWithPassword
} from './e2eTestUtils';

const uniqueSuffix = Date.now().toString(36);
const clinicId = `clinic-lifecycle-${uniqueSuffix}`;
const doctorId = `doctor-lifecycle-${uniqueSuffix}`;
const staffUser = {
  uid: `staff-${uniqueSuffix}`,
  email: `staff.${uniqueSuffix}@example.com`,
  password: 'Test1234!'
};

const queueDocPath = (queueId: string) =>
  `clinics/${clinicId}/doctors/${doctorId}/queues/${queueId}`;
const patientDocPath = (queueId: string, patientId: string) =>
  `${queueDocPath(queueId)}/patients/${patientId}`;

const createdPatients: Array<{ queueId: string; patientId: string }> = [];

const enrollStaffUser = async () => {
  await admin
    .auth()
    .createUser({ uid: staffUser.uid, email: staffUser.email, password: staffUser.password })
    .catch((err: Error & { code?: string }) => {
      if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
        return admin.auth().updateUser(staffUser.uid, {
          email: staffUser.email,
          password: staffUser.password
        });
      }
      throw err;
    });

  await admin
    .firestore()
    .doc(`users/${staffUser.uid}`)
    .set(
      {
        clinicId,
        doctorId,
        additionalClinicIds: [clinicId],
        roles: ['clinic-admin']
      },
      { merge: true }
    );
};

beforeAll(async () => {
  const db = admin.firestore();

  await db.doc(`clinics/${clinicId}`).set(
    {
      name: 'Lifecycle Test Clinic',
      createdAt: new Date().toISOString()
    },
    { merge: true }
  );

  await db.doc(`clinics/${clinicId}/doctors/${doctorId}`).set(
    {
      clinicId,
      name: 'Lifecycle Test Doctor',
      scheduling: {
        realTimeStatus: {
          online: true,
          note: 'Ready for tests',
          source: 'staff',
          updatedAt: Timestamp.now()
        }
      }
    },
    { merge: true }
  );

  await enrollStaffUser();
});

afterAll(async () => {
  const db = admin.firestore();

  await Promise.all(
    createdPatients.map(async ({ queueId, patientId }) => {
      await db.doc(patientDocPath(queueId, patientId)).delete().catch(() => undefined);
    })
  );

  const queuesSnap = await db.collection(`clinics/${clinicId}/doctors/${doctorId}/queues`).get();
  await Promise.all(queuesSnap.docs.map((doc) => doc.ref.delete().catch(() => undefined)));

  await db.doc(`clinics/${clinicId}/doctors/${doctorId}`).delete().catch(() => undefined);
  await db.doc(`clinics/${clinicId}`).delete().catch(() => undefined);
  await db.doc(`users/${staffUser.uid}`).delete().catch(() => undefined);

  await admin.auth().deleteUsers([staffUser.uid]).catch(() => undefined);
  await disposeFirebaseApp();
});

describe('Queue lifecycle callables (emulator)', () => {
  it('allows a patient to cancel and rejoin via patientRejoinQueue', async () => {
    const joinResponse = await callCallable(
      'joinQueue',
      {
        clinicId,
        doctorId,
        patientData: {
          name: 'Cancel Me',
          age: '30',
          phone: '9000000000'
        }
      }
    );

    expect(joinResponse.status).toBe(200);

    const joinResult = joinResponse.body?.result as {
      patientId: string;
      queueId: string;
      accessToken: string;
    };

    expect(joinResult?.patientId).toBeTruthy();
    createdPatients.push({ queueId: joinResult.queueId, patientId: joinResult.patientId });

    const cancelResponse = await callCallable(
      'patientCancelToken',
      {
        clinicId,
        doctorId,
        queueId: joinResult.queueId,
        patientId: joinResult.patientId,
        token: joinResult.accessToken
      }
    );

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body?.result?.status).toBe('cancelled');

    const rejoinResponse = await callCallable(
      'patientRejoinQueue',
      {
        clinicId,
        doctorId,
        queueId: joinResult.queueId,
        patientId: joinResult.patientId,
        token: joinResult.accessToken
      }
    );

    expect(rejoinResponse.status).toBe(200);
    expect(rejoinResponse.body?.result?.status).toBe('waiting');
    expect(rejoinResponse.body?.result?.rejoin?.patientId).toBeTruthy();
    expect(rejoinResponse.body?.result?.rejoin?.queueId).toMatch(/\d{4}-\d{2}-\d{2}/);

    const newPatientId = rejoinResponse.body?.result?.rejoin?.patientId as string;
    const newQueueId = rejoinResponse.body?.result?.rejoin?.queueId as string;
    if (newPatientId && newQueueId) {
      createdPatients.push({ queueId: newQueueId, patientId: newPatientId });
    }
  }, TEST_TIMEOUT_MS);

  it('advances the queue and toggles auto-advance', async () => {
    const db = admin.firestore();
  const queueId = `queue-${Date.now()}`;

    const staffToken = await getStaffToken();

    const staffTokenResponse = await callCallable(
      'manualAddPatient',
      {
        clinicId,
        doctorId,
        queueId,
        patient: {
          name: 'Queue One',
          age: 40,
          phone: '9000000001'
        }
      },
      staffToken
    );

    expect(staffTokenResponse.status).toBe(200);
    const firstPatient = staffTokenResponse.body?.result as { patientId: string };
    expect(firstPatient?.patientId).toBeTruthy();

    const secondResponse = await callCallable(
      'manualAddPatient',
      {
        clinicId,
        doctorId,
        queueId,
        patient: {
          name: 'Queue Two',
          age: 28,
          phone: '9000000002'
        }
      },
      staffToken
    );

    expect(secondResponse.status).toBe(200);
    const secondPatient = secondResponse.body?.result as { patientId: string };
    expect(secondPatient?.patientId).toBeTruthy();

    createdPatients.push({ queueId, patientId: firstPatient.patientId });
    createdPatients.push({ queueId, patientId: secondPatient.patientId });

    const autoAdvanceEnable = await callCallable(
      'setQueueAutoAdvance',
      {
        clinicId,
        doctorId,
        queueId,
        enabled: true
      },
      staffToken
    );

    expect(autoAdvanceEnable.status).toBe(200);
    expect(autoAdvanceEnable.body?.result?.success).toBe(true);

    const advanceResponse = await callCallable(
      'advanceQueue',
      {
        clinicId,
        doctorId,
        queueId
      },
      staffToken
    );

    expect(advanceResponse.status).toBe(200);
    expect(advanceResponse.body?.result?.success).toBe(true);
    const completedId = advanceResponse.body?.result?.completedPatientId as string | null;
    if (completedId) {
      expect(completedId).toBe(firstPatient.patientId);
    }
    expect(advanceResponse.body?.result?.promotedPatientId).toBe(firstPatient.patientId);

    const queueRef = db.doc(queueDocPath(queueId));
    const queueSnap = await queueRef.get();
    const queueData = queueSnap.data() as Record<string, unknown> | undefined;
    expect(queueData?.autoAdvance).toBe(true);
    expect(typeof queueData?.currentToken).toBe('number');

    const inProgressSnap = await queueRef
      .collection('patients')
      .where('status', '==', 'in-progress')
      .get();
    expect(inProgressSnap.docs.some((doc) => doc.id === firstPatient.patientId)).toBe(true);

    const waitingSnapshot = await queueRef.collection('patients').doc(secondPatient.patientId).get();
    expect(waitingSnapshot.data()?.status).toBe('waiting');
  }, TEST_TIMEOUT_MS);

  it('updates queue status transitions with proper auth', async () => {
    const queueId = `status-${Date.now()}`;

    const staffToken = await getStaffToken();

    const createQueue = await callCallable(
      'manualAddPatient',
      {
        clinicId,
        doctorId,
        queueId,
        patient: {
          name: 'Status Check',
          age: 35,
          phone: '9000000003'
        }
      },
      staffToken
    );

    expect(createQueue.status).toBe(200);
    const patient = createQueue.body?.result as { patientId: string };
    createdPatients.push({ queueId, patientId: patient.patientId });

    const pause = await callCallable(
      'updateQueueStatus',
      {
        clinicId,
        doctorId,
        queueId,
        newStatus: 'paused'
      },
      staffToken
    );
    expect(pause.status).toBe(200);

    const resume = await callCallable(
      'updateQueueStatus',
      {
        clinicId,
        doctorId,
        queueId,
        newStatus: 'active'
      },
      staffToken
    );
    expect(resume.status).toBe(200);

    const db = admin.firestore();
    const queueSnap = await db.doc(queueDocPath(queueId)).get();
    expect(queueSnap.data()?.status).toBe('active');
  }, TEST_TIMEOUT_MS);

  it('rejects rejoin attempts with an invalid token', async () => {
    const joinResponse = await callCallable(
      'joinQueue',
      {
        clinicId,
        doctorId,
        patientData: {
          name: 'Bad Token',
          age: '27',
          phone: '9000000004'
        }
      }
    );

    expect(joinResponse.status).toBe(200);
    const joinResult = joinResponse.body?.result as {
      patientId: string;
      queueId: string;
      accessToken: string;
    };

    expect(joinResult?.patientId).toBeTruthy();
    createdPatients.push({ queueId: joinResult.queueId, patientId: joinResult.patientId });

    const cancelResponse = await callCallable(
      'patientCancelToken',
      {
        clinicId,
        doctorId,
        queueId: joinResult.queueId,
        patientId: joinResult.patientId,
        token: joinResult.accessToken
      }
    );

    expect(cancelResponse.status).toBe(200);

    const invalidToken = `${joinResult.accessToken.slice(0, 32)}invalid-token-override-value`;
    const rejoinResponse = await callCallable(
      'patientRejoinQueue',
      {
        clinicId,
        doctorId,
        queueId: joinResult.queueId,
        patientId: joinResult.patientId,
        token: invalidToken
      }
    );

    expect(rejoinResponse.status).toBe(403);
    expect(rejoinResponse.body?.error?.status).toBe('PERMISSION_DENIED');

    const patientSnap = await admin
      .firestore()
      .doc(patientDocPath(joinResult.queueId, joinResult.patientId))
      .get();
    expect(patientSnap.data()?.status).toBe('cancelled');
  }, TEST_TIMEOUT_MS);

  it('fails to advance a paused queue', async () => {
    const staffToken = await getStaffToken();
    const queueId = `paused-${Date.now()}`;

    const createResponse = await callCallable(
      'manualAddPatient',
      {
        clinicId,
        doctorId,
        queueId,
        patient: {
          name: 'Paused Queue Patient',
          age: 45,
          phone: '9000000005'
        }
      },
      staffToken
    );

    expect(createResponse.status).toBe(200);
    const patientResult = createResponse.body?.result as { patientId: string };
    expect(patientResult?.patientId).toBeTruthy();
    createdPatients.push({ queueId, patientId: patientResult.patientId });

    const pauseResponse = await callCallable(
      'updateQueueStatus',
      {
        clinicId,
        doctorId,
        queueId,
        newStatus: 'paused'
      },
      staffToken
    );

    expect(pauseResponse.status).toBe(200);

    const advanceResponse = await callCallable(
      'advanceQueue',
      {
        clinicId,
        doctorId,
        queueId
      },
      staffToken
    );

    expect(advanceResponse.status).toBe(400);
    expect(advanceResponse.body?.error?.status).toBe('FAILED_PRECONDITION');

    const patientSnap = await admin
      .firestore()
      .doc(patientDocPath(queueId, patientResult.patientId))
      .get();
    expect(patientSnap.data()?.status).toBe('waiting');
  }, TEST_TIMEOUT_MS);
});

let cachedStaffToken: string | null = null;

const getStaffToken = async (): Promise<string> => {
  if (cachedStaffToken) {
    return cachedStaffToken;
  }

  cachedStaffToken = await signInWithPassword(staffUser.email, staffUser.password);
  return cachedStaffToken;
};
