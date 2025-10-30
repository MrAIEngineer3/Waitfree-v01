import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { admin } from '../src/firebaseAdmin';

import {
  TEST_TIMEOUT_MS,
  callCallable,
  disposeFirebaseApp,
  signInWithPassword,
  upsertAuthUser
} from './e2eTestUtils';

const staffUser = {
  uid: 'staff-lifecycle',
  email: 'staff.lifecycle@example.com',
  password: 'Test1234!'
};

const clinicId = 'clinicA';
const doctorId = 'doctorA';

beforeAll(async () => {
  await upsertAuthUser(staffUser.uid, staffUser.email, staffUser.password);

  const db = admin.firestore();
  await db.doc(`users/${staffUser.uid}`).set({
    clinicId,
    doctorId,
    additionalClinicIds: [clinicId]
  }, { merge: true });

  await db.doc(`clinics/${clinicId}`).set({ name: 'Clinic A', createdAt: new Date().toISOString() }, { merge: true });
  await db.doc(`clinics/${clinicId}/doctors/${doctorId}`).set({ name: 'Doctor A', clinicId }, { merge: true });
});

afterAll(async () => {
  await disposeFirebaseApp();
  await admin.auth().deleteUsers([staffUser.uid]).catch(() => undefined);
});

describe('Patient lifecycle (emulator)', () => {
  it('transitions patient statuses and records cancellation', async () => {
    const staffToken = await signInWithPassword(staffUser.email, staffUser.password);
    const queueId = `queue-lifecycle-${Date.now()}`;

    const firstPatient = await callCallable(
      'manualAddPatient',
      {
        clinicId,
        doctorId,
        queueId,
        suppressNotification: true,
        patient: {
          name: 'Lifecycle One',
          age: 31,
          phone: '9999911111'
        }
      },
      staffToken
    );

    expect(firstPatient.status).toBe(200);
    const firstResult = firstPatient.body?.result as { patientId: string; tokenNumber: number };
    expect(firstResult).toBeTruthy();

    const secondPatient = await callCallable(
      'manualAddPatient',
      {
        clinicId,
        doctorId,
        queueId,
        suppressNotification: true,
        patient: {
          name: 'Lifecycle Two',
          age: 29,
          phone: '9999922222'
        }
      },
      staffToken
    );

    expect(secondPatient.status).toBe(200);
    const secondResult = secondPatient.body?.result as { patientId: string; accessToken: string };
    expect(secondResult).toBeTruthy();

    const queueSnapAfterAdds = await admin.firestore()
      .doc(`clinics/${clinicId}/doctors/${doctorId}/queues/${queueId}`)
      .get();

    expect(queueSnapAfterAdds.exists).toBe(true);
    expect(queueSnapAfterAdds.data()?.totalPatients).toBe(2);

    const inProgress = await callCallable(
      'updatePatientStatus',
      {
        clinicId,
        doctorId,
        queueId,
        patientId: firstResult.patientId,
        newStatus: 'in-progress'
      },
      staffToken
    );

    expect(inProgress.status).toBe(200);
    expect(inProgress.body?.result?.success).toBe(true);

    const patientRef = admin.firestore()
      .doc(`clinics/${clinicId}/doctors/${doctorId}/queues/${queueId}/patients/${firstResult.patientId}`);
    const patientAfterInProgress = await patientRef.get();

    expect(patientAfterInProgress.data()?.status).toBe('in-progress');
    expect(patientAfterInProgress.data()?.service?.startedAt).toBeTruthy();

    const completed = await callCallable(
      'updatePatientStatus',
      {
        clinicId,
        doctorId,
        queueId,
        patientId: firstResult.patientId,
        newStatus: 'completed'
      },
      staffToken
    );

    expect(completed.status).toBe(200);
    expect(completed.body?.result?.success).toBe(true);

    const patientAfterCompleted = await patientRef.get();
    expect(patientAfterCompleted.data()?.status).toBe('completed');
    expect(patientAfterCompleted.data()?.service?.completedAt).toBeTruthy();

    const queueAfterCompleted = await admin.firestore()
      .doc(`clinics/${clinicId}/doctors/${doctorId}/queues/${queueId}`)
      .get();

    expect(queueAfterCompleted.data()?.currentToken).toBe(firstResult.tokenNumber);
    expect(queueAfterCompleted.data()?.completedPatients).toBe(1);

    const cancelResponse = await callCallable(
      'patientCancelToken',
      {
        clinicId,
        doctorId,
        queueId,
        patientId: secondResult.patientId,
        token: secondResult.accessToken
      }
    );

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body?.result?.success).toBe(true);
    expect(cancelResponse.body?.result?.status).toBe('cancelled');

    const secondPatientDoc = await admin.firestore()
      .doc(`clinics/${clinicId}/doctors/${doctorId}/queues/${queueId}/patients/${secondResult.patientId}`)
      .get();

    expect(secondPatientDoc.data()?.status).toBe('cancelled');
    expect(secondPatientDoc.data()?.cancellation?.cancelledBy).toBe('patient-self');
  }, TEST_TIMEOUT_MS);
});
