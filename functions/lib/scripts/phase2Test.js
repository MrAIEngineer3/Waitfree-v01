"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
const node_fetch_1 = __importDefault(require("node-fetch"));
if (!process.env.FIRESTORE_EMULATOR_HOST)
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST)
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9098';
if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-test' });
}
const host = process.env.FUNCTIONS_HOST || 'http://localhost:5002';
const region = 'asia-south1';
const projectId = process.env.FIREBASE_EMULATOR_PROJECT_ID || process.env.GCLOUD_PROJECT || 'waitfree-9b06e';
let authIdToken = null;
async function ensureAuth() {
    if (authIdToken)
        return authIdToken;
    const authHost = process.env.AUTH_EMULATOR_HOST || 'localhost:9098';
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
    const url = `${host}/${projectId}/${region}/${name}`;
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
        const store = admin.firestore();
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
    const store = admin.firestore();
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