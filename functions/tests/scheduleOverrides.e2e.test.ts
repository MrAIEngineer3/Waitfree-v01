import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { admin } from '../src/firebaseAdmin';
import type { Timestamp } from 'firebase-admin/firestore';

import {
  TEST_TIMEOUT_MS,
  callCallable,
  disposeFirebaseApp,
  signInWithPassword,
  upsertAuthUser
} from './e2eTestUtils';

const staffUser = {
  uid: 'staff-schedule',
  email: 'staff.schedule@example.com',
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

describe('Doctor schedule overrides (emulator)', () => {
  it('creates, updates, and deletes overrides', async () => {
    const staffToken = await signInWithPassword(staffUser.email, staffUser.password);

    const now = Date.now();
    const startIso = new Date(now + 60 * 60 * 1000).toISOString();
    const endIso = new Date(now + 2 * 60 * 60 * 1000).toISOString();

    const createResponse = await callCallable(
      'createDoctorScheduleOverride',
      {
        clinicId,
        doctorId,
        type: 'blocker',
        note: 'Initial override window',
        reasonCode: 'vacation',
        start: startIso,
        end: endIso
      },
      staffToken
    );

    expect(createResponse.status).toBe(200);
    const overrideId = createResponse.body?.result?.overrideId as string | undefined;
    expect(overrideId).toBeTruthy();

    const overrideDocRef = admin.firestore()
      .doc(`clinics/${clinicId}/doctors/${doctorId}/schedulingOverrides/${overrideId}`);
    const createdOverride = await overrideDocRef.get();

    expect(createdOverride.exists).toBe(true);
    expect(createdOverride.data()?.type).toBe('blocker');
    expect(createdOverride.data()?.note).toBe('Initial override window');
    expect(createdOverride.data()?.reasonCode).toBe('vacation');

    const updatedStart = new Date(now + 90 * 60 * 1000).toISOString();
    const updatedEnd = new Date(now + 3 * 60 * 60 * 1000).toISOString();

    const updateResponse = await callCallable(
      'updateDoctorScheduleOverride',
      {
        clinicId,
        doctorId,
        overrideId,
        type: 'blocker',
        note: 'Updated override window',
        reasonCode: 'surgery',
        start: updatedStart,
        end: updatedEnd
      },
      staffToken
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body?.result?.success).toBe(true);

    const updatedOverride = await overrideDocRef.get();
    const updatedOverrideData = updatedOverride.data();
    const startTimestamp = updatedOverrideData?.start as Timestamp | undefined;
    const endTimestamp = updatedOverrideData?.end as Timestamp | undefined;

    expect(updatedOverrideData?.note).toBe('Updated override window');
    expect(updatedOverrideData?.reasonCode).toBe('surgery');
    expect(startTimestamp).toBeTruthy();
    expect(startTimestamp!.toDate().toISOString()).toBe(updatedStart);
    expect(endTimestamp).toBeTruthy();
    expect(endTimestamp!.toDate().toISOString()).toBe(updatedEnd);

    const deleteResponse = await callCallable(
      'deleteDoctorScheduleOverride',
      {
        clinicId,
        doctorId,
        overrideId
      },
      staffToken
    );

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body?.result?.success).toBe(true);

    const afterDelete = await overrideDocRef.get();
    expect(afterDelete.exists).toBe(false);
  }, TEST_TIMEOUT_MS);
});
