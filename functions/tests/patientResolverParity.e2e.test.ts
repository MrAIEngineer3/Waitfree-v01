import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { admin } from '../src/firebaseAdmin';
import {
    TEST_TIMEOUT_MS,
    callCallable,
    disposeFirebaseApp
} from './e2eTestUtils';

const uniqueSuffix = Date.now().toString(36);
const clinicId = `clinic-resolver-${uniqueSuffix}`;
const doctorId = `doctor-resolver-${uniqueSuffix}`;

const createdEntries: Array<{ queueId: string; patientId: string }> = [];

const resolverFlagDoc = () => admin.firestore().doc('featureFlags/patientResolverV1');

const setResolverFlag = async (enabled: boolean) => {
  await resolverFlagDoc().set(
    {
      enabled,
      rolloutStage: enabled ? 'on' : 'off',
      updatedAt: Timestamp.now().toDate().toISOString()
    },
    { merge: true }
  );
};

const queueDocPath = (queueId: string) =>
  `clinics/${clinicId}/doctors/${doctorId}/queues/${queueId}`;
const patientDocPath = (queueId: string, patientId: string) =>
  `${queueDocPath(queueId)}/patients/${patientId}`;

beforeAll(async () => {
  const db = admin.firestore();

  await setResolverFlag(false);

  await db.doc(`clinics/${clinicId}`).set(
    {
      name: 'Resolver Parity Test Clinic',
      createdAt: new Date().toISOString()
    },
    { merge: true }
  );

  await db.doc(`clinics/${clinicId}/doctors/${doctorId}`).set(
    {
      clinicId,
      name: 'Resolver Parity Test Doctor',
      scheduling: {
        realTimeStatus: {
          online: true,
          note: 'Available for resolver parity tests',
          source: 'staff',
          updatedAt: Timestamp.now()
        }
      }
    },
    { merge: true }
  );
});

afterEach(async () => {
  await setResolverFlag(false);
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
  await resolverFlagDoc().delete().catch(() => undefined);
});

describe('patient resolver parity (emulator)', () => {
  it(
    'produces standard queue entries when resolver is forced OFF',
    async () => {
      await setResolverFlag(false);

      const response = await callCallable('joinQueue', {
        clinicId,
        doctorId,
        patientData: {
          name: 'Resolver Off Person',
          age: 29,
          phone: '+91 98765 40001'
        }
      });

      expect(response.status).toBe(200);
      const result = response.body?.result as {
        patientId: string;
        queueId: string;
        patientIdentityId?: string | null;
      };

      expect(result?.patientIdentityId).toBeUndefined();

      const db = admin.firestore();
      const patientSnap = await db.doc(patientDocPath(result.queueId, result.patientId)).get();
      const patientData = patientSnap.data() as Record<string, unknown>;

      expect(patientData.status).toBe('waiting');
      expect(patientData.phone).toBe('+919876540001');
      expect(patientData.patientIdentityId).toBeUndefined();

      createdEntries.push({ queueId: result.queueId, patientId: result.patientId });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'adds resolver metadata but preserves queue behaviour when resolver is forced ON',
    async () => {
      await setResolverFlag(true);

      const flagSnap = await resolverFlagDoc().get();
      // eslint-disable-next-line no-console
      console.log('resolver flag snapshot', flagSnap.data());

      const response = await callCallable('joinQueue', {
        clinicId,
        doctorId,
        patientData: {
          name: 'Resolver On Person',
          age: 31,
          phone: '+91 98765 40002'
        }
      });

      // Debug: surface resolver payload when running under emulator failures
      // eslint-disable-next-line no-console
      console.log('resolver-on response', response.body);

      expect(response.status).toBe(200);
      const result = response.body?.result as {
        patientId: string;
        queueId: string;
        patientIdentityId?: string | null;
        patientResolver?: Record<string, unknown> | null;
      };

      expect(typeof result?.patientIdentityId).toBe('string');
      expect(result?.patientResolver).toBeTruthy();

      const db = admin.firestore();
      const patientSnap = await db.doc(patientDocPath(result.queueId, result.patientId)).get();
      const patientData = patientSnap.data() as Record<string, unknown>;

      expect(patientData.status).toBe('waiting');
      expect(patientData.phone).toBe('+919876540002');
      expect(typeof patientData.patientIdentityId).toBe('string');
      expect(patientData.patientResolver).toBeTruthy();

      createdEntries.push({ queueId: result.queueId, patientId: result.patientId });
    },
    TEST_TIMEOUT_MS
  );
});
