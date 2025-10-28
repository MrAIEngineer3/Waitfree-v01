import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
const TEST_TIMEOUT_MS = 40000;

import { admin } from '../src/firebaseAdmin';
import 'firebase-admin/storage';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  type Auth
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  collection,
  type Firestore
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || process.env.FUNCTIONS_TEST_PROJECT || 'waitfree-9b06e';

type EmulatorConfig = {
  host?: string;
  port?: number;
};

type FirebaseJson = {
  emulators?: Record<string, EmulatorConfig>;
};

const loadFirebaseJson = (): FirebaseJson => {
  try {
    const firebaseJsonPath = path.resolve(__dirname, '..', '..', 'firebase.json');
    const contents = readFileSync(firebaseJsonPath, 'utf8');
    return JSON.parse(contents) as FirebaseJson;
  } catch {
    return {};
  }
};

const firebaseJson = loadFirebaseJson();

const getEmulatorHost = (service: string, fallback: string): string => {
  const config = firebaseJson.emulators?.[service];
  if (!config) {
    return fallback;
  }

  const host = config.host ?? '127.0.0.1';
  const port = config.port;

  if (!port) {
    return fallback;
  }

  return `${host}:${port}`;
};

const authHostRaw = process.env.FIREBASE_AUTH_EMULATOR_HOST || getEmulatorHost('auth', '127.0.0.1:9099');
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHostRaw;

const firestoreHostRaw = process.env.FIRESTORE_EMULATOR_HOST || getEmulatorHost('firestore', '127.0.0.1:8080');
process.env.FIRESTORE_EMULATOR_HOST = firestoreHostRaw;

const storageHostRaw = process.env.FIREBASE_STORAGE_EMULATOR_HOST || getEmulatorHost('storage', '127.0.0.1:9199');
process.env.FIREBASE_STORAGE_EMULATOR_HOST = storageHostRaw;
const storageOrigin =
  process.env.FIREBASE_STORAGE_EMULATOR_ORIGIN ||
  (storageHostRaw.startsWith('http') ? storageHostRaw : `http://${storageHostRaw}`);
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

const functionsFallbackHost = getEmulatorHost('functions', '127.0.0.1:5001');

const functionsOrigin =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_ORIGIN ||
  process.env.FUNCTIONS_EMULATOR ||
  (process.env.FUNCTIONS_EMULATOR_HOST ? `http://${process.env.FUNCTIONS_EMULATOR_HOST}` : `http://${functionsFallbackHost}`);

const functionsBaseUrl = `${functionsOrigin.replace(/\/$/, '')}/${projectId}/asia-south1`;
const authHost = authHostRaw;
const parseHostAndPort = (value: string): { host: string; port: number } => {
  const [host, port] = value.split(':');
  const parsedPort = Number(port);
  if (!host || Number.isNaN(parsedPort)) {
    throw new Error(`Invalid host:port value: ${value}`);
  }
  return { host, port: parsedPort };
};
const firestoreEndpoint = parseHostAndPort(firestoreHostRaw);
const storageBaseUrl = `${storageOrigin.replace(/\/$/, '')}/v0/b/${encodeURIComponent(storageBucket)}`;
const buildStorageObjectUrl = (objectPath: string): string =>
  `${storageBaseUrl}/o/${encodeURIComponent(objectPath)}?alt=media`;
const fetchStorageObject = (objectPath: string, idToken?: string) =>
  fetch(buildStorageObjectUrl(objectPath), {
    headers: {
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
    }
  });
const parseResponseBody = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
const expectPermissionDenied = async (res: Response) => {
  expect(res.status).toBe(403);
  const body = await parseResponseBody(res);
  const normalized =
    typeof body === 'string'
      ? body.toLowerCase()
      : JSON.stringify(body ?? {}).toLowerCase();
  expect(normalized).toContain('permission');
};

const staffUser = {
  uid: 'staff-good',
  email: 'staff.good@example.com',
  password: 'Test1234!'
};

const staffProfilePath = `users/${staffUser.uid}/profile.jpg`;

const rogueUser = {
  uid: 'staff-rogue',
  email: 'staff.rogue@example.com',
  password: 'Test1234!'
};

let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

const getAuthInstance = (): Auth => {
  if (!firebaseApp) {
    firebaseApp = initializeApp(
      {
        apiKey: 'test-api-key',
        projectId,
        authDomain: `${projectId}.firebaseapp.com`
      },
      'e2e-test-app'
    );
    authInstance = getAuth(firebaseApp);
    connectAuthEmulator(authInstance, `http://${authHost}`, { disableWarnings: true });
  }
  return authInstance!;
};

const getFirestoreInstance = (): Firestore => {
  if (!firebaseApp) {
    getAuthInstance();
  }
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(firebaseApp!);
    connectFirestoreEmulator(firestoreInstance, firestoreEndpoint.host, firestoreEndpoint.port);
  }
  return firestoreInstance;
};

const signInWithPassword = async (email: string, password: string): Promise<string> => {
  const auth = getAuthInstance();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();
  await signOut(auth);
  return token;
};

const signInWithPatientToken = async (customToken: string): Promise<string> => {
  const auth = getAuthInstance();
  const credential = await signInWithCustomToken(auth, customToken);
  const token = await credential.user.getIdToken();
  await signOut(auth);
  return token;
};

const callCallable = async <TData, TResult>(
  name: string,
  data: TData,
  idToken?: string
): Promise<{ status: number; body: any }> => {
  const res = await fetch(`${functionsBaseUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
    },
    body: JSON.stringify({ data })
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { status: res.status, body: parsed };
};

const upsertAuthUser = async (uid: string, email: string, password: string) => {
  try {
    await admin.auth().deleteUser(uid);
  } catch {
    // Ignore when the user does not exist yet
  }
  await admin.auth().createUser({ uid, email, password });
};

beforeAll(async () => {
  await upsertAuthUser(staffUser.uid, staffUser.email, staffUser.password);
  await upsertAuthUser(rogueUser.uid, rogueUser.email, rogueUser.password);

  await admin.firestore().doc(`users/${staffUser.uid}`).set({
    clinicId: 'clinicA',
    doctorId: 'doctorA',
    additionalClinicIds: ['clinicA']
  });

  await admin.firestore().doc(`users/${rogueUser.uid}`).set({
    clinicId: 'clinicB',
    doctorId: 'doctorB'
  });

  const db = admin.firestore();
  await db.doc('clinics/clinicA').set({ name: 'Clinic A', createdAt: new Date().toISOString() }, { merge: true });
  await db.doc('clinics/clinicA/doctors/doctorA').set({ name: 'Doctor A', clinicId: 'clinicA' }, { merge: true });
  await db.doc('clinics/clinicB').set({ name: 'Clinic B', createdAt: new Date().toISOString() }, { merge: true });
  await db.doc('clinics/clinicB/doctors/doctorB').set({ name: 'Doctor B', clinicId: 'clinicB' }, { merge: true });

  const bucket = admin.storage().bucket(storageBucket);
  const profileFile = bucket.file(staffProfilePath);
  await profileFile.delete().catch(() => undefined);
  await profileFile.save('profile-image-content');
});

afterAll(async () => {
  if (firebaseApp) {
    await deleteApp(firebaseApp);
    firebaseApp = null;
    authInstance = null;
  }

  await admin.auth().deleteUsers([staffUser.uid, rogueUser.uid]).catch(() => undefined);
});

describe('Cloud Functions authorization (emulator)', () => {
  it('allows authorised staff to manage clinic queues', async () => {
    const staffToken = await signInWithPassword(staffUser.email, staffUser.password);
    const queueId = 'queue-staff-allowed';

    const manualAdd = await callCallable(
      'manualAddPatient',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patient: {
          name: '  Authorized   Patient  ',
          age: '42',
          phone: ' 9999999999 '
        }
      },
      staffToken
    );

    expect(manualAdd.status).toBe(200);
    expect(manualAdd.body?.result?.success).toBe(true);
    const patientId = manualAdd.body?.result?.patientId as string;

    const statusUpdate = await callCallable(
      'updatePatientStatus',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patientId,
        newStatus: 'completed'
      },
      staffToken
    );

    expect(statusUpdate.status).toBe(200);
    expect(statusUpdate.body?.result?.success).toBe(true);

    const autoAdvance = await callCallable(
      'setQueueAutoAdvance',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        enabled: true
      },
      staffToken
    );

    expect(autoAdvance.status).toBe(200);
    expect(autoAdvance.body?.result?.success).toBe(true);

    const patientSnap = await admin
      .firestore()
      .collection('clinics')
      .doc('clinicA')
      .collection('doctors')
      .doc('doctorA')
      .collection('queues')
      .doc(queueId)
      .collection('patients')
      .doc(patientId)
      .get();

    expect(patientSnap.exists).toBe(true);
    expect(patientSnap.data()?.status).toBe('completed');
    expect(patientSnap.data()?.phone).toBe('+919999999999');
  expect(patientSnap.data()?.name).toBe('Authorized Patient');
  expect(patientSnap.data()?.age).toBe(42);
  }, TEST_TIMEOUT_MS);

  it('blocks staff without clinic access', async () => {
    const rogueToken = await signInWithPassword(rogueUser.email, rogueUser.password);
    const response = await callCallable(
      'manualAddPatient',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId: 'queue-denied',
        patient: {
          name: 'Denied Patient',
          age: 35,
          phone: '8888888888'
        }
      },
      rogueToken
    );

    expect(response.status).toBe(403);
    expect(response.body?.error?.status).toBe('PERMISSION_DENIED');
  }, TEST_TIMEOUT_MS);

  it('allows patients to cancel but not perform staff-only actions', async () => {
    const staffToken = await signInWithPassword(staffUser.email, staffUser.password);
    const queueId = 'queue-patient-flow';

    const manualAdd = await callCallable(
      'manualAddPatient',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patient: {
          name: ' Patient   Flow ',
          age: '28',
          phone: ' 7777777777 '
        }
      },
      staffToken
    );

    expect(manualAdd.status).toBe(200);
    const patientId = manualAdd.body?.result?.patientId as string;
    const accessToken = manualAdd.body?.result?.accessToken as string;

    const patientSession = await callCallable(
      'createPatientSession',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patientId,
        token: accessToken
      }
    );

    expect(patientSession.status).toBe(200);
    const customToken = patientSession.body?.result?.token as string;
    expect(customToken).toBeTruthy();

    const patientIdToken = await signInWithPatientToken(customToken);

    const forbiddenUpdate = await callCallable(
      'completePatient',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patientId
      },
      patientIdToken
    );

    expect(forbiddenUpdate.status).toBe(403);
    expect(forbiddenUpdate.body?.error?.status).toBe('PERMISSION_DENIED');

    const cancelResponse = await callCallable(
      'patientCancelToken',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patientId,
        token: accessToken
      }
    );

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body?.result?.success).toBe(true);
    expect(cancelResponse.body?.result?.status).toBe('cancelled');
  }, TEST_TIMEOUT_MS);
});

describe('Firestore security rules (emulator)', () => {
  it('blocks unauthenticated clinic reads', async () => {
    const firestore = getFirestoreInstance();
    await signOut(getAuthInstance()).catch(() => undefined);
    const clinicRef = doc(firestore, 'clinics', 'clinicA');
    await expect(getDoc(clinicRef)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows authorised staff to read clinic and doctors', async () => {
    const auth = getAuthInstance();
    const firestore = getFirestoreInstance();
    await signInWithEmailAndPassword(auth, staffUser.email, staffUser.password);
    try {
      const clinicSnap = await getDoc(doc(firestore, 'clinics', 'clinicA'));
      expect(clinicSnap.exists()).toBe(true);
      const doctorSnaps = await getDocs(collection(firestore, 'clinics', 'clinicA', 'doctors'));
      expect(doctorSnaps.docs.length).toBeGreaterThan(0);
    } finally {
      await signOut(auth);
    }
  });

  it('blocks staff without access from reading other clinics', async () => {
    const auth = getAuthInstance();
    const firestore = getFirestoreInstance();
    await signInWithEmailAndPassword(auth, rogueUser.email, rogueUser.password);
    try {
      await expect(getDoc(doc(firestore, 'clinics', 'clinicA'))).rejects.toMatchObject({ code: 'permission-denied' });
    } finally {
      await signOut(auth);
    }
  });

  it('allows patient sessions to read their queue document', async () => {
    const firestore = getFirestoreInstance();
    const auth = getAuthInstance();
    const queueId = `queue-security-${Date.now()}`;

    const staffToken = await signInWithPassword(staffUser.email, staffUser.password);
    const manualAdd = await callCallable(
      'manualAddPatient',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patient: {
          name: 'Queue Security Patient',
          age: 30,
          phone: '9000000000'
        }
      },
      staffToken
    );

    expect(manualAdd.status).toBe(200);
    const patientId = manualAdd.body?.result?.patientId as string;
    const accessToken = manualAdd.body?.result?.accessToken as string;
    expect(patientId).toBeTruthy();
    expect(accessToken).toBeTruthy();

    const sessionResponse = await callCallable(
      'createPatientSession',
      {
        clinicId: 'clinicA',
        doctorId: 'doctorA',
        queueId,
        patientId,
        token: accessToken
      }
    );

    expect(sessionResponse.status).toBe(200);
    const patientToken = sessionResponse.body?.result?.token as string;
    expect(patientToken).toBeTruthy();

    const patientCredential = await signInWithCustomToken(auth, patientToken);
    try {
      const queueSnap = await getDoc(doc(firestore, 'clinics', 'clinicA', 'doctors', 'doctorA', 'queues', queueId));
      expect(queueSnap.exists()).toBe(true);
    } finally {
      await signOut(auth);
      await admin.auth().deleteUser(patientCredential.user.uid).catch(() => undefined);
    }
  }, TEST_TIMEOUT_MS);
});

describe('Storage security rules (emulator)', () => {
  it('blocks unauthenticated reads of user profile images', async () => {
    const response = await fetchStorageObject(staffProfilePath);
    await expectPermissionDenied(response);
  }, TEST_TIMEOUT_MS);

  it('blocks other users from reading profile images they do not own', async () => {
    const rogueToken = await signInWithPassword(rogueUser.email, rogueUser.password);
    const response = await fetchStorageObject(staffProfilePath, rogueToken);
    await expectPermissionDenied(response);
  }, TEST_TIMEOUT_MS);

  it('allows the owner to read their profile image', async () => {
    const staffToken = await signInWithPassword(staffUser.email, staffUser.password);
    const response = await fetchStorageObject(staffProfilePath, staffToken);
    expect(response.status).toBe(200);
    const contents = await response.text();
    expect(contents).toBe('profile-image-content');
  }, TEST_TIMEOUT_MS);
});
