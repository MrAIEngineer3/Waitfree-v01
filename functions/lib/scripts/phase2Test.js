"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const firebaseAdmin_1 = require("../firebaseAdmin");
const node_fetch_1 = __importDefault(require("node-fetch"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const loadFirebaseJson = () => {
    try {
        const firebaseJsonPath = node_path_1.default.resolve(__dirname, '..', '..', 'firebase.json');
        const contents = (0, node_fs_1.readFileSync)(firebaseJsonPath, 'utf8');
        return JSON.parse(contents);
    }
    catch {
        return {};
    }
};
const firebaseJson = loadFirebaseJson();
const getEmulatorHost = (service, fallback) => {
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
const normalizeHost = (value) => value.startsWith('http://') || value.startsWith('https://') ? value.replace(/^https?:\/\//, '') : value;
const authHostRaw = process.env.FIREBASE_AUTH_EMULATOR_HOST || getEmulatorHost('auth', '127.0.0.1:9099');
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHostRaw;
const firestoreHostRaw = process.env.FIRESTORE_EMULATOR_HOST || getEmulatorHost('firestore', '127.0.0.1:8080');
process.env.FIRESTORE_EMULATOR_HOST = firestoreHostRaw;
const functionsFallbackHost = getEmulatorHost('functions', '127.0.0.1:5001');
const functionsOrigin = process.env.FIREBASE_FUNCTIONS_EMULATOR_ORIGIN ||
    process.env.FUNCTIONS_EMULATOR ||
    (process.env.FUNCTIONS_EMULATOR_HOST ? `http://${process.env.FUNCTIONS_EMULATOR_HOST}` : `http://${functionsFallbackHost}`);
const authHost = normalizeHost(authHostRaw);
const projectId = process.env.FIREBASE_EMULATOR_PROJECT_ID || process.env.GCLOUD_PROJECT || 'waitfree-9b06e';
if (!firebaseAdmin_1.admin.apps.length) {
    firebaseAdmin_1.admin.initializeApp({ projectId });
}
const region = 'asia-south1';
const functionsBaseUrl = `${functionsOrigin.replace(/\/$/, '')}/${projectId}/${region}`;
console.log('[Phase2Test] Using projectId =', projectId);
console.log('[Phase2Test] Functions origin =', functionsOrigin);
console.log('[Phase2Test] Firestore host =', firestoreHostRaw);
console.log('[Phase2Test] Auth host =', authHost);
let authIdToken = null;
async function ensureAuth() {
    if (authIdToken)
        return authIdToken;
    const url = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
    const resp = await (0, node_fetch_1.default)(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    const j = await resp.json();
    if (!resp.ok)
        throw new Error('Anonymous signUp failed: ' + JSON.stringify(j));
    authIdToken = j.idToken;
    return authIdToken;
}
async function callable(name, data) {
    const token = await ensureAuth();
    const url = `${functionsBaseUrl}/${name}`;
    const res = await (0, node_fetch_1.default)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ data }) });
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    }
    catch (_) { }
    if (!res.ok)
        throw new Error(`${name} failed ${res.status} ${text}`);
    if (json?.error)
        throw new Error(`${name} error ${JSON.stringify(json.error)}`);
    return json?.result || json;
}
async function run() {
    console.log('[Phase2Test] Start (notification engine permanently enabled – flag removed)');
    const ts = Date.now();
    const clinicName = `Engine Clinic ${ts}`;
    const doctorName = `Engine Doctor ${ts}`;
    const specialty = 'General';
    const bootstrap = await callable('bootstrapClinicAccount', { clinicName, doctorName, specialty });
    console.log('[Phase2Test] Bootstrap', bootstrap);
    const { clinicId, doctorId, queueId } = bootstrap;
    const patients = [];
    for (const p of ['A', 'B', 'C', 'D', 'E']) {
        const jr = await callable('joinQueue', { clinicId, doctorId, patientData: { name: `P${p}`, age: 35, phone: `+2999${p}` } });
        patients.push(jr);
    }
    console.log('[Phase2Test] Joined count', patients.length);
    await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: patients[0].patientId, newStatus: 'in-progress' });
    // Force recompute & poll for pos* flags
    await callable('debugRecompute', { clinicId, doctorId, queueId });
    async function poll(ids, label) {
        const store = firebaseAdmin_1.admin.firestore();
        const start = Date.now();
        let snapshots = [];
        while (Date.now() - start < 6000) {
            snapshots = await Promise.all(ids.map(async (id) => {
                const s = await store.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId).collection('queues').doc(queueId).collection('patients').doc(id).get();
                return { id, data: s.data() };
            }));
            // Did at least one new milestone appear (excluding just 'joined')?
            const anyMilestone = snapshots.some(s => {
                const n = s.data?.notifications || {};
                return n.pos1 || n.pos2 || n.pos3 || n.now || n.completed;
            });
            if (anyMilestone)
                break;
            await new Promise(r => setTimeout(r, 350));
        }
        console.log(`[Phase2Test] ${label}:`);
        snapshots.forEach(s => console.log(s.id, s.data?.notifications));
    }
    await poll(patients.slice(0, 4).map(p => p.patientId), 'After in-progress (polled)');
    // Inspect first 4 patients
    const store = firebaseAdmin_1.admin.firestore();
    async function get(pid) {
        const s = await store.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId).collection('queues').doc(queueId).collection('patients').doc(pid).get();
        return { id: pid, data: s.data() };
    }
    // (Original instant read removed; we rely on poll output above)
    await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: patients[0].patientId, newStatus: 'completed' });
    await callable('debugRecompute', { clinicId, doctorId, queueId });
    await poll(patients.slice(1, 5).map(p => p.patientId), 'After completion (polled)');
    const notifs = await store.collection('debugNotifications').orderBy('createdAt', 'desc').limit(30).get();
    const types = notifs.docs.map(d => d.data().type);
    console.log('[Phase2Test] Recent debug notification types:', types);
    const required = ['joined', 'now', 'pos2', 'pos3', 'completed'];
    const missing = required.filter(t => !types.includes(t));
    if (missing.length) {
        console.error('[Phase2Test] MISSING expected notification types:', missing);
    }
    else {
        console.log('[Phase2Test] All expected types present.');
    }
    console.log('[Phase2Test] Done');
}
run().catch(e => { console.error('[Phase2Test] FAILED', e); process.exit(1); });
//# sourceMappingURL=phase2Test.js.map