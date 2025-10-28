import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

import { admin } from '../src/firebaseAdmin';
import {
  TEST_TIMEOUT_MS,
  callCallable,
  disposeFirebaseApp
} from './e2eTestUtils';

const uniqueSuffix = Date.now().toString(36);
const clinicId = `clinic-join-${uniqueSuffix}`;
const doctorId = `doctor-join-${uniqueSuffix}`;
const createdEntries: Array<{ queueId: string; patientId: string }> = [];

const queueDocPath = (queueId: string) =>
  `clinics/${clinicId}/doctors/${doctorId}/queues/${queueId}`;
const patientDocPath = (queueId: string, patientId: string) =>
  `${queueDocPath(queueId)}/patients/${patientId}`;

beforeAll(async () => {
  const db = admin.firestore();

  await db.doc(`clinics/${clinicId}`).set(
    {
      name: 'Join Queue Test Clinic',
      createdAt: new Date().toISOString()
    },
    { merge: true }
  );

  await db.doc(`clinics/${clinicId}/doctors/${doctorId}`).set(
    {
      clinicId,
      name: 'Join Queue Test Doctor',
      scheduling: {
        realTimeStatus: {
          online: true,
          note: 'Available for tests',
          source: 'staff',
          updatedAt: Timestamp.now()
        }
      }
    },
    { merge: true }
  );
});

afterAll(async () => {
  const db = admin.firestore();

  await Promise.all(
    createdEntries.map(async ({ queueId, patientId }) => {
      const patientPath = patientDocPath(queueId, patientId);
      await db.doc(patientPath).delete().catch(() => undefined);
      await db.doc(queueDocPath(queueId)).delete().catch(() => undefined);
    })
  );

  await db.doc(`clinics/${clinicId}/doctors/${doctorId}`).delete().catch(() => undefined);
  await disposeFirebaseApp();
  await admin
    .firestore()
    .doc(`clinics/${clinicId}`)
    .delete()
    .catch(() => undefined);
});

describe('joinQueue callable (emulator)', () => {
  it('creates a queue entry and returns access token for a valid patient', async () => {
    const response = await callCallable(
      'joinQueue',
      {
        clinicId,
        doctorId,
        patientData: {
          name: '  John   Queue  ',
          age: '32',
          phone: '9876543210'
        }
      }
    );

    expect(response.status).toBe(200);
    const result = response.body?.result as {
      success: boolean;
      patientId: string;
      queueId: string;
      clinicId: string;
      doctorId: string;
      accessToken: string;
      tokenNumber: number;
    };

    expect(result?.success).toBe(true);
    expect(result?.patientId).toBeTruthy();
    expect(result?.accessToken).toBeTruthy();
  expect(result?.queueId).toMatch(/\d{4}-\d{2}-\d{2}/);

    const db = admin.firestore();
    const queueRef = db.doc(queueDocPath(result!.queueId));
    const queueSnap = await queueRef.get();

    expect(queueSnap.exists).toBe(true);
    expect(queueSnap.data()?.totalPatients).toBe(1);
    expect(queueSnap.data()?.status).toBe('active');

    const patientSnap = await db.doc(patientDocPath(result!.queueId, result!.patientId)).get();
    expect(patientSnap.exists).toBe(true);

    const patientData = patientSnap.data() as Record<string, unknown>;
    expect(patientData.name).toBe('John Queue');
    expect(patientData.age).toBe(32);
    expect(patientData.phone).toBe('+919876543210');
  expect(patientData.status).toBe('waiting');
  expect(patientData.tokenNumber).toBe(1);
    expect(typeof patientData.accessTokenHash).toBe('string');

    createdEntries.push({ queueId: result!.queueId, patientId: result!.patientId });
  }, TEST_TIMEOUT_MS);
});
