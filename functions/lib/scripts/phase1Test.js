"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ...existing content moved from /functions/scripts/phase1Test.ts...
/**
 * Phase 1 local test harness (built by tsc under lib/scripts/phase1Test.js)
 */
const firebaseAdmin_1 = require("../firebaseAdmin");
const node_fetch_1 = __importDefault(require("node-fetch"));
// Embed emulator defaults (no production impact: real deployment sets GOOGLE_APPLICATION_CREDENTIALS / no emulator vars)
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    console.log('[Harness] FIRESTORE_EMULATOR_HOST defaulted to', process.env.FIRESTORE_EMULATOR_HOST);
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9098';
    console.log('[Harness] FIREBASE_AUTH_EMULATOR_HOST defaulted to', process.env.FIREBASE_AUTH_EMULATOR_HOST);
}
// Determine projectId: prefer explicit emulator vars, then GCLOUD_PROJECT, finally fallback known default
const projectId = process.env.FIREBASE_EMULATOR_PROJECT_ID || process.env.GCLOUD_PROJECT || 'waitfree-9b06e';
if (!firebaseAdmin_1.admin.apps.length) {
    firebaseAdmin_1.admin.initializeApp({ projectId });
}
const host = process.env.FUNCTIONS_HOST || 'http://localhost:5002';
const region = 'asia-south1';
console.log('[Harness] Using projectId =', projectId);
let authIdToken = null;
async function ensureAuth() {
    if (authIdToken)
        return authIdToken;
    // Auth emulator default port from firebase.json: 9098
    const authHost = process.env.AUTH_EMULATOR_HOST || 'localhost:9098';
    const url = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
    const resp = await (0, node_fetch_1.default)(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    const j = await resp.json();
    if (!resp.ok)
        throw new Error('Anonymous signUp failed: ' + JSON.stringify(j));
    authIdToken = j.idToken;
    console.log('[Harness] Signed in anonymously');
    return authIdToken;
}
async function callable(name, data) {
    const url = `${host}/${projectId}/${region}/${name}`;
    const token = await ensureAuth();
    const res = await (0, node_fetch_1.default)(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ data })
    });
    let text = null;
    try {
        text = await res.text();
    }
    catch (_) { /* ignore */ }
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    }
    catch (_) { /* keep raw */ }
    if (!res.ok) {
        throw new Error(`${name} failed: ${res.status} body=${text}`);
    }
    if (json?.error)
        throw new Error(`${name} callable error: ${JSON.stringify(json.error)}`);
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
    const { clinicId, doctorId, queueId } = bootstrap;
    // Disable autoAdvance for deterministic behavior
    try {
        await callable('setQueueAutoAdvance', { clinicId, doctorId, queueId, enabled: false });
        console.log('AutoAdvance disabled for test queue');
    }
    catch (e) {
        console.warn('Could not disable autoAdvance (non-fatal):', e);
    }
    const patients = [];
    for (const p of ['Alice', 'Bob']) {
        const jr = await callable('joinQueue', { clinicId, doctorId, patientData: { name: p, age: 30, phone: '+1000' + p[0] } });
        console.log('Joined:', jr);
        patients.push(jr);
    }
    const first = patients[0];
    await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: first.patientId, newStatus: 'in-progress' });
    console.log('Set in-progress');
    await new Promise(r => setTimeout(r, 2000));
    await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: first.patientId, newStatus: 'completed' });
    console.log('Completed first patient');
    // Poll for serviceDurationMs & metrics.avgServiceMs (engine & Phase1 async timing)
    const store = firebaseAdmin_1.admin.firestore();
    const patientRef = store.collection('clinics').doc(clinicId)
        .collection('doctors').doc(doctorId)
        .collection('queues').doc(queueId)
        .collection('patients').doc(first.patientId);
    const queueRef = store.collection('clinics').doc(clinicId)
        .collection('doctors').doc(doctorId)
        .collection('queues').doc(queueId);
    const start = Date.now();
    let serviceBlock = null;
    let metricsBlock = null;
    while (Date.now() - start < 8000) {
        const [pSnap, qSnap] = await Promise.all([patientRef.get(), queueRef.get()]);
        serviceBlock = pSnap.data()?.service;
        metricsBlock = qSnap.data()?.metrics;
        if (serviceBlock?.serviceDurationMs && metricsBlock?.avgServiceMs)
            break;
        await new Promise(r => setTimeout(r, 400));
    }
    console.log('Patient service block (polled):', serviceBlock);
    console.log('Queue metrics (polled):', metricsBlock);
    const notifs = await firebaseAdmin_1.admin.firestore().collection('debugNotifications').orderBy('createdAt', 'desc').limit(10).get();
    console.log('Recent notifications:');
    notifs.forEach(n => console.log(n.id, n.data()));
    console.log('Phase1 test done');
}
run().catch(e => { console.error(e); process.exit(1); });
//# sourceMappingURL=phase1Test.js.map