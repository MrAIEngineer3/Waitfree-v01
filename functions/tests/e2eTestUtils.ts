import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
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
  getFirestore,
  type Firestore
} from 'firebase/firestore';

import { admin } from '../src/firebaseAdmin';

export const TEST_TIMEOUT_MS = 40000;

const projectId =
  process.env.GCLOUD_PROJECT || process.env.FUNCTIONS_TEST_PROJECT || 'waitfree-9b06e';

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

const authHostRaw =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || getEmulatorHost('auth', '127.0.0.1:9099');
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHostRaw;

const firestoreHostRaw =
  process.env.FIRESTORE_EMULATOR_HOST || getEmulatorHost('firestore', '127.0.0.1:8080');
process.env.FIRESTORE_EMULATOR_HOST = firestoreHostRaw;

const storageHostRaw =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST || getEmulatorHost('storage', '127.0.0.1:9199');
process.env.FIREBASE_STORAGE_EMULATOR_HOST = storageHostRaw;
const storageOrigin =
  process.env.FIREBASE_STORAGE_EMULATOR_ORIGIN ||
  (storageHostRaw.startsWith('http') ? storageHostRaw : `http://${storageHostRaw}`);
export const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

if (!process.env.NOTIFIER_DISABLE_TWILIO) {
  process.env.NOTIFIER_DISABLE_TWILIO = 'true';
}

const functionsFallbackHost = getEmulatorHost('functions', '127.0.0.1:5001');

const functionsOrigin =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_ORIGIN ||
  process.env.FUNCTIONS_EMULATOR ||
  (process.env.FUNCTIONS_EMULATOR_HOST
    ? `http://${process.env.FUNCTIONS_EMULATOR_HOST}`
    : `http://${functionsFallbackHost}`);

const functionsBaseUrl = `${functionsOrigin.replace(/\/$/, '')}/${projectId}/asia-south1`;

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

export const fetchStorageObject = (objectPath: string, idToken?: string) =>
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

export const expectPermissionDenied = async (res: Response) => {
  expect(res.status).toBe(403);
  const body = await parseResponseBody(res);
  const normalized =
    typeof body === 'string'
      ? body.toLowerCase()
      : JSON.stringify(body ?? {}).toLowerCase();
  expect(normalized).toContain('permission');
};

type CallableResult = {
  status: number;
  body: any;
};

let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

export const getAuthInstance = (): Auth => {
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
    connectAuthEmulator(authInstance, `http://${authHostRaw}`, { disableWarnings: true });
  }
  return authInstance!;
};

export const getFirestoreInstance = (): Firestore => {
  if (!firebaseApp) {
    getAuthInstance();
  }
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(firebaseApp!);
    connectFirestoreEmulator(firestoreInstance, firestoreEndpoint.host, firestoreEndpoint.port);
  }
  return firestoreInstance;
};

export const signInWithPassword = async (email: string, password: string): Promise<string> => {
  const auth = getAuthInstance();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();
  await signOut(auth);
  return token;
};

export const signInWithPatientToken = async (customToken: string): Promise<string> => {
  const auth = getAuthInstance();
  const credential = await signInWithCustomToken(auth, customToken);
  const token = await credential.user.getIdToken();
  await signOut(auth);
  return token;
};

export const callCallable = async <TData>(
  name: string,
  data: TData,
  idToken?: string
): Promise<CallableResult> => {
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

export const upsertAuthUser = async (uid: string, email: string, password: string) => {
  try {
    await admin.auth().deleteUser(uid);
  } catch {
    // Ignore when the user does not exist yet
  }
  await admin.auth().createUser({ uid, email, password });
};

export const deleteAuthUsers = async (uids: string[]) => {
  if (uids.length === 0) {
    return;
  }
  await admin.auth().deleteUsers(uids).catch(() => undefined);
};

export const disposeFirebaseApp = async () => {
  if (firebaseApp) {
    await deleteApp(firebaseApp);
    firebaseApp = null;
    authInstance = null;
    firestoreInstance = null;
  }
};

export { projectId };
