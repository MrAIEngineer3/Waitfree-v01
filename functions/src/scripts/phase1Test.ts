// ...existing content moved from /functions/scripts/phase1Test.ts...
/**
 * Phase 1 local test harness (built by tsc under lib/scripts/phase1Test.js)
 */
import fetch from 'node-fetch';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { admin } from '../firebaseAdmin';

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

const normalizeHost = (value: string): string =>
  value.startsWith('http://') || value.startsWith('https://') ? value.replace(/^https?:\/\//, '') : value;

const authHostRaw = process.env.FIREBASE_AUTH_EMULATOR_HOST || getEmulatorHost('auth', '127.0.0.1:9099');
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHostRaw;

const firestoreHostRaw = process.env.FIRESTORE_EMULATOR_HOST || getEmulatorHost('firestore', '127.0.0.1:8080');
process.env.FIRESTORE_EMULATOR_HOST = firestoreHostRaw;

const functionsFallbackHost = getEmulatorHost('functions', '127.0.0.1:5001');
const functionsOrigin =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_ORIGIN ||
  process.env.FUNCTIONS_EMULATOR ||
  (process.env.FUNCTIONS_EMULATOR_HOST ? `http://${process.env.FUNCTIONS_EMULATOR_HOST}` : `http://${functionsFallbackHost}`);

const authHost = normalizeHost(authHostRaw);

// Determine projectId: prefer explicit emulator vars, then GCLOUD_PROJECT, finally fallback known default
const projectId = process.env.FIREBASE_EMULATOR_PROJECT_ID || process.env.GCLOUD_PROJECT || 'waitfree-9b06e';
if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

interface JoinResult { patientId: string; queueId: string; clinicId: string; doctorId: string; }

const region = 'asia-south1';
const functionsBaseUrl = `${functionsOrigin.replace(/\/$/, '')}/${projectId}/${region}`;
console.log('[Harness] Using projectId =', projectId);
console.log('[Harness] Functions origin =', functionsOrigin);
console.log('[Harness] Firestore host =', firestoreHostRaw);
console.log('[Harness] Auth host =', authHost);

let authIdToken: string | null = null;

async function ensureAuth() {
  if (authIdToken) return authIdToken;
  // Auth emulator default port from firebase.json: 9098
  const url = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const j = await resp.json();
  if (!resp.ok) throw new Error('Anonymous signUp failed: ' + JSON.stringify(j));
  authIdToken = j.idToken;
  console.log('[Harness] Signed in anonymously');
  return authIdToken;
}

async function callable(name: string, data: any) {
  const url = `${functionsBaseUrl}/${name}`;
  const token = await ensureAuth();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ data })
  });
  let text: string | null = null;
  try { text = await res.text(); } catch (_) { /* ignore */ }
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* keep raw */ }
  if (!res.ok) {
    throw new Error(`${name} failed: ${res.status} body=${text}`);
  }
  if (json?.error) throw new Error(`${name} callable error: ${JSON.stringify(json.error)}`);
  return json?.result || json;
}

async function run() {
  console.log('Phase1 test start (Phase1 notifications expected ON)');
  const ts = Date.now();
  const clinicName = `Test Clinic ${ts}`;
  const doctorName = `Test Doctor ${ts}`;
  const specialty = 'General';
  const bootstrap = await callable('bootstrapClinicAccount', { clinicName, doctorName, specialty });
  console.log('Bootstrap:', bootstrap);
  const { clinicId, doctorId, queueId } = bootstrap as any;

  // Disable autoAdvance for deterministic behavior
  try {
    await callable('setQueueAutoAdvance', { clinicId, doctorId, queueId, enabled: false });
    console.log('AutoAdvance disabled for test queue');
  } catch (e) {
    console.warn('Could not disable autoAdvance (non-fatal):', e);
  }

  const patients: JoinResult[] = [] as any;
  for (const p of ['Alice', 'Bob']) {
    const jr = await callable('joinQueue', { clinicId, doctorId, patientData: { name: p, age: 30, phone: '+1000' + p[0] } });
    console.log('Joined:', jr);
    patients.push(jr as any);
  }

  const first = patients[0];
  await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: first.patientId, newStatus: 'in-progress' });
  console.log('Set in-progress');
  await new Promise(r => setTimeout(r, 2000));
  await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: first.patientId, newStatus: 'completed' });
  console.log('Completed first patient');

  // Poll for serviceDurationMs & metrics.avgServiceMs (engine & Phase1 async timing)
  const store = admin.firestore();
  const patientRef = store.collection('clinics').doc(clinicId)
    .collection('doctors').doc(doctorId)
    .collection('queues').doc(queueId)
    .collection('patients').doc(first.patientId);
  const queueRef = store.collection('clinics').doc(clinicId)
    .collection('doctors').doc(doctorId)
    .collection('queues').doc(queueId);
  const start = Date.now();
  let serviceBlock: any = null;
  let metricsBlock: any = null;
  while (Date.now() - start < 8000) {
    const [pSnap, qSnap] = await Promise.all([patientRef.get(), queueRef.get()]);
    serviceBlock = pSnap.data()?.service;
    metricsBlock = qSnap.data()?.metrics;
    if (serviceBlock?.serviceDurationMs && metricsBlock?.avgServiceMs) break;
    await new Promise(r => setTimeout(r, 400));
  }
  console.log('Patient service block (polled):', serviceBlock);
  console.log('Queue metrics (polled):', metricsBlock);

  const notifs = await admin.firestore().collection('debugNotifications').orderBy('createdAt', 'desc').limit(10).get();
  console.log('Recent notifications:');
  notifs.forEach(n => console.log(n.id, n.data()));
  console.log('Phase1 test done');
}

run().catch(e => { console.error(e); process.exit(1); });
