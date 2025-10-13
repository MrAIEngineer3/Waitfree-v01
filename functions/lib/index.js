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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapClinicAccount = exports.setQueueAutoAdvance = exports.updateQueueStatus = exports.updatePatientStatus = exports.getPatientView = exports.joinQueue = exports.onPatientStatusChange = exports.onNewPatient = exports.ping = exports.debugGetPatient = exports.debugRecompute = exports.debugPatientPwaBaseUrl = exports.debugRuntimeFlags = void 0;
const firestore_1 = require("@google-cloud/firestore");
// Ensure local .env variables are loaded when running in emulator / local scripts
const cors_1 = __importDefault(require("cors"));
const crypto_1 = __importDefault(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
require("./loadEnv");
// Import functions for local use
const notificationEngine_1 = require("./notificationEngine");
const notifier_1 = require("./notifier");
const timing_1 = require("./utils/timing");
// Initialize the Admin SDK. This is required for all backend functions.
admin.initializeApp();
const db = admin.firestore();
// Export functions from other files to make them deployable
__exportStar(require("./notifier"), exports);
// Simplified CORS configuration:
// - Production: prefer origins set via Firebase functions config (cors.origins)
// - Local dev fallback: allow localhost on the patient PWA dev port
// This provides a single, predictable production source of truth and a safe local fallback.
let allowedOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001'];
let configError = null;
try {
    const corsConfig = functions.config().cors;
    if (corsConfig && corsConfig.origins) {
        allowedOrigins = corsConfig.origins.split(',').map((s) => s.trim()).filter(Boolean);
    }
    else {
        configError = "Config object or origins property was missing.";
    }
}
catch (e) {
    configError = `Error fetching functions.config(): ${e.message}`;
}
// This log runs ONCE when the function instance starts up.
// Feature flags NEW_NOTIFICATION_ENGINE / PHASE1_NOTIFICATIONS have been removed.
// Engine + Phase1 notifications are now permanently enabled (unless you change code).
console.log(`GLOBAL: Allowed origins loaded: [${allowedOrigins.join(", ")}]. Config error: ${configError || 'None'}. Notification engine + phase1 ALWAYS ENABLED (flags removed).`);
const runInBackground = (taskName, task) => {
    setImmediate(() => {
        const span = (0, timing_1.startTiming)(`runInBackground.${taskName}`, { taskName });
        try {
            Promise.resolve(task()).then(() => {
                span.succeed({ status: 'resolved' });
                functions.logger.debug(`${taskName} completed (background)`);
            }).catch((err) => {
                span.fail({
                    error: err instanceof Error ? err.message : String(err)
                });
                if (err instanceof Error) {
                    functions.logger.warn(`${taskName} failed (background)`, { message: err.message, stack: err.stack });
                }
                else {
                    functions.logger.warn(`${taskName} failed (background)`, { error: err });
                }
            });
        }
        catch (err) {
            span.fail({
                error: err instanceof Error ? err.message : String(err)
            });
            if (err instanceof Error) {
                functions.logger.warn(`${taskName} failed (background-sync)`, { message: err.message, stack: err.stack });
            }
            else {
                functions.logger.warn(`${taskName} failed (background-sync)`, { error: err });
            }
        }
    });
};
// Use cors with a dynamic origin function to validate incoming origin header against allowedOrigins.
const corsHandler = (0, cors_1.default)({
    origin: (origin, callback) => {
        // This log runs for EVERY request.
        console.log(`CORS CHECK: Request from origin [${origin}].`);
        if (!origin || allowedOrigins.includes(origin)) {
            console.log(`CORS VERDICT: Origin [${origin}] ALLOWED.`);
            callback(null, true);
        }
        else {
            console.error(`CORS VERDICT: Origin [${origin}] DENIED because it is not in [${allowedOrigins.join(", ")}].`);
            callback(null, false);
        }
    }
});
// Configure region for all functions
const regionalFunctions = functions.region('asia-south1');
// Runtime options keep latency in check; warm pools opt-in via environment if required later.
const callableRuntimeOptions = {
    timeoutSeconds: 60,
    memory: '512MB'
};
const minInstancesEnv = process.env.FUNCTIONS_MIN_INSTANCES;
const parsedMinInstances = minInstancesEnv ? Number(minInstancesEnv) : NaN;
if (!Number.isNaN(parsedMinInstances) && parsedMinInstances > 0) {
    callableRuntimeOptions.minInstances = parsedMinInstances;
    console.log(`Runtime warm pool enabled with minInstances=${parsedMinInstances}`);
}
else {
    console.log('Runtime warm pool disabled; using on-demand scaling.');
}
const callableFunctions = regionalFunctions.runWith(callableRuntimeOptions);
/** DEBUG: Returns runtime flag visibility and Node version */
exports.debugRuntimeFlags = regionalFunctions.https.onCall(async (_data, _ctx) => {
    return {
        phase1Enabled: true,
        rawPhase1: 'hardcoded:true',
        engineEnabled: true,
        rawEngine: 'hardcoded:true',
        node: process.version
    };
});
/** DEBUG: Show resolved Patient PWA base URL */
exports.debugPatientPwaBaseUrl = regionalFunctions.https.onCall(async (_data, _ctx) => {
    try {
        const envVal = process.env.PATIENT_PWA_BASE_URL || null;
        let cfgVal = null;
        try {
            const cfg = functions?.config?.();
            cfgVal = cfg?.app?.patient_pwa_base_url || null;
        }
        catch {
            cfgVal = null;
        }
        const resolved = envVal || cfgVal || null;
        return { env: !!envVal, envVal, cfg: !!cfgVal, cfgVal, resolved };
    }
    catch (e) {
        return { error: e?.message || String(e) };
    }
});
/** DEBUG: Force recompute for a queue (engine default-on). data: { clinicId, doctorId, queueId } */
exports.debugRecompute = regionalFunctions.https.onCall(async (data, _ctx) => {
    const { clinicId, doctorId, queueId } = data || {};
    if (!clinicId || !doctorId || !queueId) {
        throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId required');
    }
    // Log environment variables for debugging
    functions.logger.info('Environment Variables Check', {
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'UNSET',
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'UNSET',
        TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || 'UNSET',
        TEST_PHONE_NUMBER: process.env.TEST_PHONE_NUMBER || 'UNSET'
    });
    const result = await (0, notificationEngine_1.recomputeQueueNotifications)({ clinicId, doctorId, queueId });
    return { success: true, result };
});
/** DEBUG: Fetch patient doc raw (no auth). data: { clinicId, doctorId, queueId, patientId } */
exports.debugGetPatient = regionalFunctions.https.onCall(async (data, _ctx) => {
    const { clinicId, doctorId, queueId, patientId } = data || {};
    if (!clinicId || !doctorId || !queueId || !patientId) {
        throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId, patientId required');
    }
    const snap = await admin.firestore().collection('clinics').doc(clinicId)
        .collection('doctors').doc(doctorId)
        .collection('queues').doc(queueId)
        .collection('patients').doc(patientId).get();
    if (!snap.exists)
        return { found: false };
    return { found: true, data: snap.data() };
});
// NOTE: Staff privilege logic removed for simplification.
// Any authenticated user may perform queue and patient management actions.
// Simple HTTPS callable function example
exports.ping = callableFunctions.https.onCall(async (data, context) => {
    return { message: 'pong', received: data ?? null, uid: context.auth?.uid ?? null };
});
// Removed helloHttp demo endpoint (unused)
// Removed adminSetStaffClaim and grantStaffRole (no staff system in simplified mode).
// Removed devCompletePatient (dev-only, unused)
// Dev-only debug endpoint: echo the request headers so we can see what the emulator receives.
// Useful to diagnose header/secret mismatches from different shells.
// Removed devEchoHeaders (dev-only, unused)
// Dev-only diagnostic: report whether the functions runtime can see the admin secret.
// Only returns masked/length info to avoid leaking secrets.
// Removed devShowAdminSecret (dev-only, unused)
// Firestore trigger example (adjust collection as needed)
exports.onNewPatient = regionalFunctions.firestore
    .document('patients/{patientId}')
    .onCreate(async (snap, ctx) => {
    const data = snap.data();
    functions.logger.info('New patient created', { id: ctx.params.patientId, data });
});
/**
 * Firestore Trigger that fires when a patient's status is updated
 * Specifically monitors for status changes to 'in-progress' to send notifications
 */
exports.onPatientStatusChange = regionalFunctions.firestore
    .document('clinics/{clinicId}/doctors/{doctorId}/queues/{queueId}/patients/{patientId}')
    .onUpdate(async (change, context) => {
    try {
        // Get the patient data before and after the change
        const beforeData = change.before.data();
        const afterData = change.after.data();
        // Engine is always on now; legacy trigger suppressed permanently.
        functions.logger.debug('onPatientStatusChange legacy handler permanently suppressed (engine default)', {
            patientId: context.params.patientId,
            beforeStatus: beforeData.status,
            afterStatus: afterData.status
        });
        return null;
        // Check if the status field actually changed
        if (beforeData.status === afterData.status) {
            functions.logger.info('Patient document updated but status unchanged', {
                patientId: context.params.patientId,
                status: afterData.status
            });
            return null;
        }
        // Check if the status changed TO 'in-progress'
        if (afterData.status === 'in-progress') {
            // Extract patient details for logging and future notification sending
            const patientName = afterData.name || 'Unknown Patient';
            const phoneNumber = afterData.phone || 'Unknown Phone';
            functions.logger.info(`Patient ${patientName}'s turn is next. Preparing to send notification to ${phoneNumber}.`, {
                patientId: context.params.patientId,
                clinicId: context.params.clinicId,
                doctorId: context.params.doctorId,
                queueId: context.params.queueId,
                patientName,
                phoneNumber,
                previousStatus: beforeData.status,
                newStatus: afterData.status
            });
            // Mark and send a 'now' notification if not already sent. We record this on the patient doc
            // using a `notifications.now` flag so we don't duplicate sends.
            try {
                const patientRef = change.after.ref;
                const patientSnapLatest = await patientRef.get();
                const p = patientSnapLatest.data();
                const already = p?.notifications?.now === true;
                if (!already) {
                    await patientRef.set({ notifications: { ...(p?.notifications || {}), now: true } }, { merge: true });
                    (0, notifier_1.sendNotification)({
                        to: p?.phone || 'unknown',
                        type: 'now',
                        payload: { name: p?.name, tokenNumber: p?.tokenNumber, clinicId: context.params.clinicId, doctorId: context.params.doctorId }
                    }).catch((notifyErr) => {
                        functions.logger.warn('Now notification (background) failed', notifyErr);
                    });
                }
                else {
                    functions.logger.info('Now notification already sent for patient', { patientId: context.params.patientId });
                }
            }
            catch (e) {
                functions.logger.warn('Failed to send or mark now notification', e);
            }
            return null;
        }
        else {
            // Status changed to something other than 'in-progress'
            functions.logger.info(`Status changed to ${afterData.status}. No notification sent.`, {
                patientId: context.params.patientId,
                previousStatus: beforeData.status,
                newStatus: afterData.status
            });
            return null;
        }
    }
    catch (error) {
        functions.logger.error('Error in onPatientStatusChange function:', error, {
            patientId: context.params.patientId,
            clinicId: context.params.clinicId,
            doctorId: context.params.doctorId,
            queueId: context.params.queueId
        });
        return null;
    }
});
/**
 * Callable Cloud Function to add a patient to a queue.
 * This is invoked from the client SDK and handles auth and data serialization.
 * Implements secure queue joining with automatic token assignment.
 */
exports.joinQueue = callableFunctions.https.onCall(async (data, context) => {
    try {
        // Extract data from the 'data' parameter provided by the client SDK
        const { clinicId, doctorId, patientData } = data;
        // Validate required fields
        if (!clinicId || !doctorId || !patientData) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, and patientData are required.');
        }
        if (!patientData.name || !patientData.age || !patientData.phone) {
            throw new functions.https.HttpsError('invalid-argument', 'Patient data must include name, age, and phone.');
        }
        // 1. Get current date in YYYY-MM-DD format for the queue ID
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        // 2. Define database references
        const db = admin.firestore();
        const queueRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(today);
        const patientsRef = queueRef.collection('patients');
        let newPatientData;
        // raw token will be generated inside the transaction and returned to client
        let rawAccessToken = '';
        // 3. Start a Firestore transaction
        await db.runTransaction(async (transaction) => {
            const queueDoc = await transaction.get(queueRef);
            let newTokenNumber;
            if (!queueDoc.exists) {
                newTokenNumber = 1;
                const newQueueData = {
                    id: today,
                    doctorId: doctorId,
                    clinicId: clinicId,
                    status: 'active',
                    currentToken: 0,
                    totalPatients: 1,
                    completedPatients: 0,
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                };
                transaction.set(queueRef, newQueueData);
            }
            else {
                const queueData = queueDoc.data();
                newTokenNumber = (queueData?.totalPatients || 0) + 1;
                transaction.update(queueRef, {
                    totalPatients: newTokenNumber
                });
            }
            rawAccessToken = crypto_1.default.randomBytes(32).toString('hex');
            const accessTokenHash = crypto_1.default.createHash('sha256').update(rawAccessToken).digest('hex');
            newPatientData = {
                id: '', // Will be set after document creation
                name: patientData.name,
                age: patientData.age,
                phone: patientData.phone,
                tokenNumber: newTokenNumber,
                status: 'waiting',
                joinedAt: firestore_1.FieldValue.serverTimestamp(),
                queueId: today,
                clinicId: clinicId,
                doctorId: doctorId,
                accessTokenHash: accessTokenHash,
            };
            const newPatientRef = patientsRef.doc();
            newPatientData.id = newPatientRef.id;
            transaction.set(newPatientRef, newPatientData);
        });
        // Send "joined" notification (non-blocking)
        try {
            // Mark the patient's notifications.joined flag (so emulator/debug shows it) and emit a debug notification
            try {
                await admin.firestore().collection('clinics').doc(clinicId)
                    .collection('doctors').doc(doctorId)
                    .collection('queues').doc(today)
                    .collection('patients').doc(newPatientData.id)
                    .set({ notifications: { joined: true } }, { merge: true });
            }
            catch (e) {
                functions.logger.warn('Failed to mark joined notification on patient doc', e);
            }
            (0, notifier_1.sendNotification)({
                to: newPatientData.phone,
                type: 'joined',
                payload: {
                    name: newPatientData.name,
                    tokenNumber: newPatientData.tokenNumber,
                    clinicId,
                    doctorId,
                    queueId: today,
                    patientId: newPatientData.id,
                    accessToken: rawAccessToken
                }
            }).catch((notifyErr) => {
                functions.logger.warn('Joined notification (background) failed', notifyErr);
            });
        }
        catch (notifyErr) {
            functions.logger.warn('Failed to send joined notification (continuing):', notifyErr);
        }
        // Return data to the client
        return {
            success: true,
            message: 'Successfully joined the queue',
            patientId: newPatientData.id,
            queueId: today,
            doctorId: doctorId,
            clinicId: clinicId,
            accessToken: rawAccessToken
        };
    }
    catch (error) {
        functions.logger.error('Error in joinQueue function:', error);
        // Re-throw HttpsError for the client SDK to handle it correctly
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // For other errors, throw a generic internal error
        throw new functions.https.HttpsError('internal', 'An internal error occurred while trying to join the queue.');
    }
});
/**
 * Callable Cloud Function to return a patient's view after validating a short-lived token.
 * Expected data: { clinicId, doctorId, queueId, patientId, token }
 */
exports.getPatientView = callableFunctions.https.onCall(async (data, context) => {
    try {
        const { clinicId, doctorId, queueId, patientId, token } = data || {};
        if (!clinicId || !doctorId || !queueId || !patientId || !token) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, patientId, token');
        }
        const db = admin.firestore();
        const patientRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId)
            .collection('patients').doc(patientId);
        const patientSnap = await patientRef.get();
        if (!patientSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Patient not found');
        }
        const patientData = patientSnap.data();
        const storedHash = patientData?.accessTokenHash;
        if (!storedHash) {
            throw new functions.https.HttpsError('permission-denied', 'Access token not configured for this patient');
        }
        const tokenHash = crypto_1.default.createHash('sha256').update(String(token)).digest('hex');
        if (tokenHash !== storedHash) {
            throw new functions.https.HttpsError('permission-denied', 'Invalid token');
        }
        // Do not return the accessTokenHash
        const safeData = { ...patientData };
        delete safeData.accessTokenHash;
        return { success: true, patient: safeData };
    }
    catch (error) {
        functions.logger.error('Error in getPatientView function:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Internal server error');
    }
});
/**
 * Firebase Callable Function to update a patient's status in the queue
 * Requires authentication and handles queue metadata updates when patients are completed
 *
 * @param data - Object containing clinicId, doctorId, queueId, patientId, and newStatus
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and updated patient data
 */
exports.updatePatientStatus = callableFunctions.https.onCall(async (data, context) => {
    const span = (0, timing_1.startTiming)('updatePatientStatus', {
        uid: context.auth?.uid ?? null,
        clinicId: data?.clinicId,
        doctorId: data?.doctorId,
        queueId: data?.queueId,
        newStatus: data?.newStatus
    });
    let autoAdvancePromoted = false;
    let recomputeTriggered = false;
    let phase1DurationMs = null;
    let spanClosed = false;
    try {
        // Check authentication and staff claim (supports emulator users/{uid}.staff fallback)
        if (!context.auth) {
            span.fail({ reason: 'unauthenticated' });
            spanClosed = true;
            throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
        }
        // Simplified: any authenticated user can proceed.
        functions.logger.debug('updatePatientStatus auth check (simplified mode)', { uid: context.auth.uid });
        // Extract and validate required fields
        const { clinicId, doctorId, queueId, patientId, newStatus } = data;
        if (!clinicId || !doctorId || !queueId || !patientId || !newStatus) {
            span.fail({ reason: 'invalid-argument' });
            spanClosed = true;
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, patientId, and newStatus are required.');
        }
        // Validate status values
        const validStatuses = ['waiting', 'in-progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(newStatus)) {
            span.fail({ reason: 'invalid-status', provided: newStatus });
            spanClosed = true;
            throw new functions.https.HttpsError('invalid-argument', `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
        // Define database references
        const db = admin.firestore();
        const patientRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId)
            .collection('patients').doc(patientId);
        const queueRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        let updatedPatientData;
        // Phase 1 flag (defaults enabled if env not set to '0')
        const phase1Enabled = true; // Permanently enabled (feature flag removed)
        functions.logger.debug('Phase1 notifications active (permanently enabled – flags removed)', { phase1Enabled });
        // Use Firestore transaction ensuring all reads occur before any writes
        const txnSpan = (0, timing_1.startTiming)('updatePatientStatus.transaction', {
            clinicId,
            doctorId,
            queueId,
            patientId,
            newStatus
        });
        try {
            await db.runTransaction(async (transaction) => {
                // 1. Read patient doc
                const readPatientSpan = (0, timing_1.startTiming)('updatePatientStatus.transaction.readPatient', {
                    clinicId,
                    doctorId,
                    queueId,
                    patientId
                });
                let patientDoc;
                try {
                    patientDoc = await transaction.get(patientRef);
                    readPatientSpan.succeed({ found: patientDoc.exists });
                }
                catch (readErr) {
                    readPatientSpan.fail({ error: readErr instanceof Error ? readErr.message : String(readErr) });
                    throw readErr;
                }
                if (!patientDoc.exists) {
                    throw new functions.https.HttpsError('not-found', 'Patient document not found.');
                }
                const patientData = patientDoc.data();
                // 2. If completing OR moving to in-progress we need queue doc (read now before any write)
                let queueDoc = null;
                if (newStatus === 'completed' || newStatus === 'in-progress') {
                    const readQueueSpan = (0, timing_1.startTiming)('updatePatientStatus.transaction.readQueue', {
                        clinicId,
                        doctorId,
                        queueId,
                        newStatus
                    });
                    try {
                        queueDoc = await transaction.get(queueRef);
                        readQueueSpan.succeed({ found: queueDoc.exists });
                    }
                    catch (queueErr) {
                        readQueueSpan.fail({ error: queueErr instanceof Error ? queueErr.message : String(queueErr) });
                        throw queueErr;
                    }
                    if (!queueDoc.exists) {
                        throw new functions.https.HttpsError('not-found', 'Queue document not found.');
                    }
                }
                // 3. If setting in-progress enforce single in-progress patient (read collection now)
                if (newStatus === 'in-progress') {
                    const guardSpan = (0, timing_1.startTiming)('updatePatientStatus.transaction.inProgressGuard', {
                        clinicId,
                        doctorId,
                        queueId,
                        patientId
                    });
                    try {
                        const patientsCollRef = queueRef.collection('patients');
                        const inProgressQuery = await patientsCollRef.where('status', '==', 'in-progress').limit(1).get();
                        if (!inProgressQuery.empty) {
                            const existing = inProgressQuery.docs[0];
                            if (existing.id !== patientId) {
                                guardSpan.fail({ conflictingPatientId: existing.id });
                                throw new functions.https.HttpsError('failed-precondition', 'Another patient is already in progress.');
                            }
                            guardSpan.succeed({ conflictsFound: 1 });
                        }
                        else {
                            guardSpan.succeed({ conflictsFound: 0 });
                        }
                    }
                    catch (guardErr) {
                        if (!(guardErr instanceof functions.https.HttpsError && guardErr.code === 'failed-precondition')) {
                            guardSpan.fail({ error: guardErr instanceof Error ? guardErr.message : String(guardErr) });
                        }
                        throw guardErr;
                    }
                }
                // 4. Perform writes after all necessary reads gathered
                // Prepare base update
                const baseUpdate = { status: newStatus, updatedAt: firestore_1.FieldValue.serverTimestamp() };
                // Phase 1: when moving to in-progress, set service.startedAt if not already set
                if (phase1Enabled && newStatus === 'in-progress') {
                    const alreadyStarted = patientData?.service?.startedAt;
                    if (!alreadyStarted) {
                        baseUpdate['service'] = { ...patientData?.service, startedAt: firestore_1.FieldValue.serverTimestamp() };
                        functions.logger.debug('Phase1 adding service.startedAt', { patientId, newStatus });
                    }
                    else {
                        functions.logger.debug('Phase1 service.startedAt already present', { patientId });
                    }
                }
                // Phase 1: when completing, if we have a startedAt and no completedAt yet, set completedAt and compute duration placeholder (duration computed after transaction with actual timestamps if needed)
                if (phase1Enabled && newStatus === 'completed') {
                    const svc = patientData?.service || {};
                    if (svc.startedAt && !svc.completedAt) {
                        baseUpdate['service'] = { ...svc, completedAt: firestore_1.FieldValue.serverTimestamp() };
                        functions.logger.debug('Phase1 setting service.completedAt placeholder', { patientId });
                    }
                    else {
                        functions.logger.debug('Phase1 completed branch skipped (missing startedAt or already completedAt)', { patientId, hasStarted: !!svc.startedAt, hasCompleted: !!svc.completedAt });
                    }
                }
                updatedPatientData = { ...patientData, ...baseUpdate };
                transaction.update(patientRef, baseUpdate);
                if (queueDoc) {
                    const patientTokenNumber = patientData?.tokenNumber || 0;
                    if (newStatus === 'completed') {
                        const queueData = queueDoc.data();
                        const currentCompletedPatients = queueData?.completedPatients || 0;
                        transaction.update(queueRef, {
                            completedPatients: currentCompletedPatients + 1,
                            currentToken: patientTokenNumber, // last completed patient token
                            updatedAt: firestore_1.FieldValue.serverTimestamp()
                        });
                    }
                    else if (newStatus === 'in-progress') {
                        // Update currentToken immediately when we start serving a patient to avoid UI lag on patient view
                        transaction.update(queueRef, {
                            currentToken: patientTokenNumber,
                            updatedAt: firestore_1.FieldValue.serverTimestamp()
                        });
                    }
                }
            });
            txnSpan.succeed({});
        }
        catch (txnError) {
            txnSpan.fail({ error: txnError instanceof Error ? txnError.message : String(txnError) });
            throw txnError;
        }
        functions.logger.info('Patient status updated successfully', {
            patientId,
            newStatus,
            clinicId,
            doctorId,
            queueId,
            uid: context.auth.uid
        });
        // Phase 1 post-transaction logic
        // 1. If patient just completed: compute service duration & update queue avg service time; send completed notification once.
        // 2. Legacy staged notifications remain untouched for now (we append completed flow before them to avoid interfering).
        try {
            if (phase1Enabled && newStatus === 'completed') {
                const phaseSpan = (0, timing_1.startTiming)('updatePatientStatus.phase1Completion', {
                    clinicId,
                    doctorId,
                    queueId,
                    patientId
                });
                const phaseStarted = process.hrtime.bigint();
                try {
                    const db = admin.firestore();
                    const patientSnap = await db.collection('clinics').doc(clinicId)
                        .collection('doctors').doc(doctorId)
                        .collection('queues').doc(queueId)
                        .collection('patients').doc(patientId).get();
                    const latest = patientSnap.data();
                    const svc = latest?.service || {};
                    let serviceDurationMs;
                    if (svc.startedAt && svc.completedAt && !svc.serviceDurationMs) {
                        // Compute duration locally using Timestamp seconds if available
                        try {
                            const startedTs = svc.startedAt;
                            const completedTs = svc.completedAt;
                            if (startedTs?.toMillis && completedTs?.toMillis) {
                                serviceDurationMs = completedTs.toMillis() - startedTs.toMillis();
                            }
                        }
                        catch (_) {
                            /* ignore */
                        }
                    }
                    // Update patient doc with duration if computed
                    if (serviceDurationMs && !svc.serviceDurationMs) {
                        await patientSnap.ref.set({ service: { ...svc, serviceDurationMs } }, { merge: true });
                        functions.logger.debug('Phase1 wrote serviceDurationMs', { patientId, serviceDurationMs });
                    }
                    // Update queue average (EMA) if we have a fresh duration
                    if (serviceDurationMs && serviceDurationMs > 0) {
                        const queueRef = db.collection('clinics').doc(clinicId)
                            .collection('doctors').doc(doctorId)
                            .collection('queues').doc(queueId);
                        const emaSpan = (0, timing_1.startTiming)('updatePatientStatus.phase1Completion.updateQueueAvg', {
                            clinicId,
                            doctorId,
                            queueId,
                            patientId
                        });
                        try {
                            await db.runTransaction(async (tx) => {
                                const qDoc = await tx.get(queueRef);
                                if (qDoc.exists) {
                                    const qd = qDoc.data() || {};
                                    const oldAvg = qd?.metrics?.avgServiceMs;
                                    const alpha = 0.2; // smoothing factor
                                    const newAvg = oldAvg ? Math.round(oldAvg * (1 - alpha) + serviceDurationMs * alpha) : serviceDurationMs;
                                    const metrics = { ...(qd.metrics || {}), avgServiceMs: newAvg, updatedAt: firestore_1.FieldValue.serverTimestamp() };
                                    tx.set(queueRef, { metrics }, { merge: true });
                                    functions.logger.debug('Phase1 updated queue avgServiceMs', { queueId, newAvg });
                                    emaSpan.succeed({ newAvg });
                                }
                                else {
                                    emaSpan.succeed({ skipped: 'queue-missing' });
                                }
                            });
                        }
                        catch (emaErr) {
                            emaSpan.fail({ error: emaErr instanceof Error ? emaErr.message : String(emaErr) });
                            throw emaErr;
                        }
                    }
                    // Send completed notification if not already flagged (notifications.completed)
                    const alreadyCompletedNotified = latest?.notifications?.completed === true;
                    if (!alreadyCompletedNotified) {
                        const completedSpan = (0, timing_1.startTiming)('updatePatientStatus.phase1Completion.completedNotification', {
                            clinicId,
                            doctorId,
                            queueId,
                            patientId
                        });
                        try {
                            await patientSnap.ref.set({ notifications: { ...(latest?.notifications || {}), completed: true } }, { merge: true });
                            (0, notifier_1.sendNotification)({
                                to: latest?.phone || 'unknown',
                                type: 'completed',
                                payload: {
                                    name: latest?.name,
                                    tokenNumber: latest?.tokenNumber,
                                    clinicId, doctorId, queueId,
                                    serviceDurationMs: serviceDurationMs || null
                                }
                            }).catch((sendErr) => {
                                functions.logger.warn('Completed notification (background) failed', sendErr);
                            });
                            functions.logger.debug('Phase1 sent completed notification', { patientId });
                            completedSpan.succeed({});
                        }
                        catch (e) {
                            completedSpan.fail({ error: e instanceof Error ? e.message : String(e) });
                            functions.logger.warn('Failed to send completed notification', e);
                        }
                    }
                    const phaseFinished = process.hrtime.bigint();
                    phase1DurationMs = Number(phaseFinished - phaseStarted) / 1000000;
                    phaseSpan.succeed({ serviceDurationMs: serviceDurationMs ?? null });
                }
                catch (phaseErr) {
                    phaseSpan.fail({ error: phaseErr instanceof Error ? phaseErr.message : String(phaseErr) });
                    throw phaseErr;
                }
            }
        }
        catch (e) {
            if (phase1DurationMs === null) {
                phase1DurationMs = 0;
            }
            functions.logger.warn('Phase1 completion post-processing failed (non-fatal)', e);
        }
        // Legacy staged notification logic removed (engine handles position). Only handle cancellation explicitly.
        if (newStatus === 'cancelled') {
            try {
                (0, notifier_1.sendNotification)({
                    to: updatedPatientData?.phone,
                    type: 'cancelled',
                    payload: {
                        name: updatedPatientData?.name,
                        tokenNumber: updatedPatientData?.tokenNumber,
                        clinicId, doctorId, queueId,
                        message: 'Your queue entry has been cancelled. If this was a mistake, please contact the clinic to rejoin.'
                    }
                }).catch((cancelErr) => {
                    functions.logger.warn('Cancellation notification (background) failed', cancelErr);
                });
            }
            catch (e) {
                functions.logger.warn('Failed to send cancellation notification', e);
            }
        }
        // Server-side auto-advance: if queue has autoAdvance true, promote next waiting patient automatically
        try {
            if (newStatus === 'completed') {
                const autoSpan = (0, timing_1.startTiming)('updatePatientStatus.autoAdvance', {
                    clinicId,
                    doctorId,
                    queueId,
                    patientId
                });
                try {
                    const queueSnap = await admin.firestore().collection('clinics').doc(clinicId)
                        .collection('doctors').doc(doctorId)
                        .collection('queues').doc(queueId).get();
                    const qData = queueSnap.data() || {};
                    if (qData.autoAdvance === true && qData.status !== 'ended' && qData.status !== 'paused') {
                        const nextSnap = await admin.firestore().collection('clinics').doc(clinicId)
                            .collection('doctors').doc(doctorId)
                            .collection('queues').doc(queueId)
                            .collection('patients')
                            .where('status', '==', 'waiting')
                            .orderBy('tokenNumber')
                            .limit(1)
                            .get();
                        if (!nextSnap.empty) {
                            const nextDoc = nextSnap.docs[0];
                            const nextData = nextDoc.data();
                            const nextToken = nextData?.tokenNumber || 0;
                            await Promise.all([
                                nextDoc.ref.update({ status: 'in-progress', updatedAt: firestore_1.FieldValue.serverTimestamp() }),
                                queueRef.update({ currentToken: nextToken, updatedAt: firestore_1.FieldValue.serverTimestamp() })
                            ]);
                            functions.logger.info('Auto-advance promoted next patient', { nextPatientId: nextDoc.id, nextToken });
                            autoAdvancePromoted = true;
                        }
                    }
                    autoSpan.succeed({ promoted: autoAdvancePromoted });
                }
                catch (autoInnerErr) {
                    autoSpan.fail({ error: autoInnerErr instanceof Error ? autoInnerErr.message : String(autoInnerErr) });
                    throw autoInnerErr;
                }
            }
        }
        catch (autoErr) {
            functions.logger.warn('Auto-advance failed (non-fatal)', autoErr);
            autoAdvancePromoted = false;
        }
        // Phase 2 recompute (top 3 logic) after any status transition of interest
        if (['completed', 'in-progress', 'cancelled'].includes(newStatus)) {
            functions.logger.debug('Notification engine recompute (default-on)', { clinicId, doctorId, queueId, newStatus });
            runInBackground('notificationEngine.recompute', () => (0, notificationEngine_1.recomputeQueueNotifications)({ clinicId, doctorId, queueId }));
            recomputeTriggered = true;
        }
        span.succeed({
            autoAdvancePromoted,
            recomputeTriggered,
            phase1DurationMs
        });
        spanClosed = true;
        return {
            success: true,
            message: `Patient status successfully updated to ${newStatus}`,
            patient: updatedPatientData
        };
    }
    catch (error) {
        functions.logger.error('Error in updatePatientStatus function:', error);
        if (!spanClosed) {
            span.fail({ error: error instanceof Error ? error.message : String(error) });
            spanClosed = true;
        }
        // Re-throw HttpsError for proper client handling
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Internal server error occurred while updating patient status.');
    }
});
/**
 * Firebase Callable Function to update a queue's status
 * Requires authentication and allows clinic staff to control queue state
 *
 * @param data - Object containing clinicId, doctorId, queueId, and newStatus
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and updated queue data
 */
exports.updateQueueStatus = callableFunctions.https.onCall(async (data, context) => {
    const span = (0, timing_1.startTiming)('updateQueueStatus', {
        uid: context.auth?.uid ?? null,
        clinicId: data?.clinicId,
        doctorId: data?.doctorId,
        queueId: data?.queueId,
        newStatus: data?.newStatus
    });
    try {
        // Check authentication and staff claim (supports emulator users/{uid}.staff fallback)
        if (!context.auth) {
            span.fail({ reason: 'unauthenticated' });
            throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
        }
        // Simplified: any authenticated user can proceed.
        functions.logger.debug('updateQueueStatus auth check (simplified mode)', { uid: context.auth.uid });
        // Extract and validate required fields
        const { clinicId, doctorId, queueId, newStatus } = data;
        if (!clinicId || !doctorId || !queueId || !newStatus) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, and newStatus are required.');
        }
        // Validate status values
        const validStatuses = ['active', 'paused', 'ended'];
        if (!validStatuses.includes(newStatus)) {
            throw new functions.https.HttpsError('invalid-argument', `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
        // Define database reference
        const db = admin.firestore();
        const queueRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        // Update queue status (simple write, no transaction needed)
        await queueRef.update({
            status: newStatus,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        functions.logger.info('Queue status updated successfully', {
            queueId,
            newStatus,
            clinicId,
            doctorId,
            uid: context.auth.uid
        });
        span.succeed({});
        return {
            success: true,
            message: `Queue status successfully updated to ${newStatus}`,
            queueId,
            newStatus
        };
    }
    catch (error) {
        functions.logger.error('Error in updateQueueStatus function:', error);
        span.fail({ error: error instanceof Error ? error.message : String(error) });
        // Re-throw HttpsError for proper client handling
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Internal server error occurred while updating queue status.');
    }
});
/**
 * Toggle or set queue autoAdvance flag.
 * data: { clinicId, doctorId, queueId, enabled }
 */
exports.setQueueAutoAdvance = callableFunctions.https.onCall(async (data, context) => {
    const span = (0, timing_1.startTiming)('setQueueAutoAdvance', {
        uid: context.auth?.uid ?? null,
        clinicId: data?.clinicId,
        doctorId: data?.doctorId,
        queueId: data?.queueId,
        enabled: data?.enabled
    });
    try {
        if (!context.auth) {
            span.fail({ reason: 'unauthenticated' });
            throw new functions.https.HttpsError('unauthenticated', 'Auth required');
        }
        const { clinicId, doctorId, queueId, enabled } = data || {};
        if (!clinicId || !doctorId || !queueId || typeof enabled !== 'boolean') {
            span.fail({ reason: 'invalid-argument' });
            throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId, enabled(boolean) required');
        }
        const ref = admin.firestore().collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        await ref.set({ autoAdvance: enabled }, { merge: true });
        functions.logger.info('AutoAdvance flag updated', { clinicId, doctorId, queueId, enabled, uid: context.auth.uid });
        span.succeed({});
        return { success: true, enabled };
    }
    catch (err) {
        functions.logger.error('setQueueAutoAdvance error', err);
        span.fail({ error: err instanceof Error ? err.message : String(err) });
        if (err instanceof functions.https.HttpsError)
            throw err;
        throw new functions.https.HttpsError('internal', 'Failed to update autoAdvance');
    }
});
/**
 * Server-Sent Events (SSE) patient stream for a given queue.
 * URL params: /sse/clinics/{clinicId}/doctors/{doctorId}/queues/{queueId}/patients
 * Query: ?token=<optional filter>
 */
// Removed patientStream SSE endpoint (unused by frontends)
/**
 * Firebase Callable Function to bootstrap a clinic account with initial data
 * Creates default clinic, doctor, and queue documents, and links them to the user
 *
 * @param data - Object containing clinicName, doctorName, specialty, clinicId (optional), doctorId (optional)
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and created/updated identifiers
 */
exports.bootstrapClinicAccount = callableFunctions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }
        const authUid = context.auth.uid; // safe after guard
        const authEmail = context.auth.token?.email || null;
        const { clinicName, doctorName, specialty, clinicId: providedClinicId, doctorId: providedDoctorId, clinicPhone } = data || {};
        if (!clinicName || !doctorName || !specialty) {
            throw new functions.https.HttpsError('invalid-argument', 'clinicName, doctorName, specialty are required');
        }
        const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'id';
        const clinicId = providedClinicId ? String(providedClinicId) : slugify(clinicName);
        const doctorId = providedDoctorId ? String(providedDoctorId) : slugify(doctorName);
        const today = new Date().toISOString().split('T')[0];
        const db = admin.firestore();
        const clinicRef = db.collection('clinics').doc(clinicId);
        const doctorRef = clinicRef.collection('doctors').doc(doctorId);
        const queueRef = doctorRef.collection('queues').doc(today);
        const userRef = db.collection('users').doc(authUid);
        await db.runTransaction(async (tx) => {
            // IMPORTANT: All reads must occur before any writes in a Firestore transaction.
            const [clinicSnap, doctorSnap, queueSnap, userSnap] = await Promise.all([
                tx.get(clinicRef),
                tx.get(doctorRef),
                tx.get(queueRef),
                tx.get(userRef)
            ]);
            // Now perform writes based on existence
            if (!clinicSnap.exists) {
                tx.set(clinicRef, { name: clinicName, createdAt: firestore_1.FieldValue.serverTimestamp(), ownerUid: authUid, contactNumber: clinicPhone || null });
            }
            else if (clinicPhone) {
                tx.set(clinicRef, { contactNumber: clinicPhone }, { merge: true });
            }
            if (!doctorSnap.exists) {
                tx.set(doctorRef, { name: doctorName, specialty, clinicId, createdAt: firestore_1.FieldValue.serverTimestamp() });
            }
            if (!queueSnap.exists) {
                tx.set(queueRef, { status: 'active', currentToken: 0, totalPatients: 0, completedPatients: 0, autoAdvance: true, createdAt: firestore_1.FieldValue.serverTimestamp() });
            }
            tx.set(userRef, {
                email: authEmail,
                clinicId,
                doctorId,
                clinicName,
                doctorName,
                specialty,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                createdAt: userSnap.exists ? (userSnap.get('createdAt') || firestore_1.FieldValue.serverTimestamp()) : firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        functions.logger.info('bootstrapClinicAccount complete', { clinicId, doctorId, uid: authUid });
        return { success: true, clinicId, doctorId, queueId: today };
    }
    catch (err) {
        functions.logger.error('bootstrapClinicAccount error', err);
        if (err instanceof functions.https.HttpsError)
            throw err;
        throw new functions.https.HttpsError('internal', 'Failed to bootstrap clinic account');
    }
});
//# sourceMappingURL=index.js.map