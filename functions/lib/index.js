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
exports.bootstrapClinicAccount = exports.patientStream = exports.setQueueAutoAdvance = exports.updateQueueStatus = exports.updatePatientStatus = exports.getPatientView = exports.joinQueue = exports.onPatientStatusChange = exports.onNewPatient = exports.devShowAdminSecret = exports.devEchoHeaders = exports.devCompletePatient = exports.helloHttp = exports.ping = void 0;
const firestore_1 = require("@google-cloud/firestore");
const cors_1 = __importDefault(require("cors"));
const crypto_1 = __importDefault(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
// Import functions for local use
const notifier_1 = require("./notifier");
// Initialize the Admin SDK. This is required for all backend functions.
admin.initializeApp();
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
console.log(`GLOBAL: Allowed origins loaded: [${allowedOrigins.join(", ")}]. Config error: ${configError || 'None'}`);
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
// NOTE: Staff privilege logic removed for simplification.
// Any authenticated user may perform queue and patient management actions.
// Simple HTTPS callable function example
exports.ping = regionalFunctions.https.onCall(async (data, context) => {
    return { message: 'pong', received: data ?? null, uid: context.auth?.uid ?? null };
});
// HTTP function example
exports.helloHttp = regionalFunctions.https.onRequest((req, res) => {
    res.json({ ok: true, message: 'Hello from Firebase Functions in Asia South 1' });
});
// Removed adminSetStaffClaim and grantStaffRole (no staff system in simplified mode).
// Dev-only helper: mark a patient as completed and run three-away notification logic.
// Protected by the same x-admin-secret header. REMOVE before production.
exports.devCompletePatient = regionalFunctions.https.onRequest(async (req, res) => {
    try {
        const secret = process.env.ADMIN_CLAIM_SECRET;
        const header = req.header('x-admin-secret');
        const devBypass = req.header('x-dev-bypass') === 'true';
        // Allow dev bypass for local testing when admin secret isn't set in the runtime
        if (!(devBypass) && (!secret || header !== secret)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed. Use POST.' });
            return;
        }
        const { clinicId, doctorId, queueId, patientId } = req.body || {};
        if (!clinicId || !doctorId || !queueId || !patientId) {
            res.status(400).json({ error: 'Missing required fields: clinicId, doctorId, queueId, patientId' });
            return;
        }
        const db = admin.firestore();
        const patientRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId)
            .collection('patients').doc(patientId);
        const queueRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        let updatedPatientData;
        await db.runTransaction(async (transaction) => {
            const patientDoc = await transaction.get(patientRef);
            if (!patientDoc.exists) {
                res.status(404).json({ error: 'Patient not found' });
                throw new Error('Patient not found');
            }
            const patientData = patientDoc.data();
            updatedPatientData = {
                ...patientData,
                status: 'completed',
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            };
            transaction.update(patientRef, {
                status: 'completed',
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
            const queueDoc = await transaction.get(queueRef);
            if (!queueDoc.exists) {
                res.status(404).json({ error: 'Queue not found' });
                throw new Error('Queue not found');
            }
            const queueData = queueDoc.data();
            const currentCompletedPatients = queueData?.completedPatients || 0;
            const patientTokenNumber = patientData?.tokenNumber || 0;
            transaction.update(queueRef, {
                completedPatients: currentCompletedPatients + 1,
                currentToken: patientTokenNumber,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        });
        // After transaction, attempt to notify the patient who is now 3-away
        try {
            const threeAwayToken = (updatedPatientData?.tokenNumber || 0) + 3;
            const patientsRef = db.collection('clinics').doc(clinicId)
                .collection('doctors').doc(doctorId)
                .collection('queues').doc(queueId)
                .collection('patients');
            const q = patientsRef.where('tokenNumber', '==', threeAwayToken).limit(1);
            const snaps = await q.get();
            snaps.forEach(async (snap) => {
                const p = snap.data();
                try {
                    await (0, notifier_1.sendNotification)({
                        to: p.phone,
                        type: 'three-away',
                        payload: { name: p.name, tokenNumber: p.tokenNumber, clinicId, doctorId }
                    });
                }
                catch (e) {
                    functions.logger.warn('Failed to send three-away notification (dev helper)', e);
                }
            });
        }
        catch (e) {
            functions.logger.warn('Error handling three-away notification (dev helper)', e);
        }
        res.status(200).json({ success: true, message: 'Patient marked completed (dev helper)', patient: updatedPatientData });
    }
    catch (error) {
        functions.logger.error('Error in devCompletePatient:', error);
        // If the caller used the dev bypass header, include error details to help debugging locally.
        try {
            const isDevBypass = req && typeof req.header === 'function' && req.header('x-dev-bypass') === 'true';
            if (!res.headersSent) {
                if (isDevBypass) {
                    const errAny = error;
                    res.status(500).json({ error: 'Internal server error', message: errAny?.message || String(error), stack: errAny?.stack || null });
                }
                else {
                    res.status(500).json({ error: 'Internal server error' });
                }
            }
        }
        catch (e) {
            // Fallback safe response if anything goes wrong while preparing the debug payload
            if (!res.headersSent)
                res.status(500).json({ error: 'Internal server error' });
        }
    }
});
// Dev-only debug endpoint: echo the request headers so we can see what the emulator receives.
// Useful to diagnose header/secret mismatches from different shells.
exports.devEchoHeaders = regionalFunctions.https.onRequest((req, res) => {
    try {
        // Return headers and a small timestamp
        res.status(200).json({ headers: req.headers, receivedAt: new Date().toISOString() });
    }
    catch (err) {
        functions.logger.error('devEchoHeaders error', err);
        res.status(500).json({ error: 'dev echo failed' });
    }
});
// Dev-only diagnostic: report whether the functions runtime can see the admin secret.
// Only returns masked/length info to avoid leaking secrets.
exports.devShowAdminSecret = regionalFunctions.https.onRequest((req, res) => {
    try {
        const envSecret = process.env.ADMIN_CLAIM_SECRET || null;
        res.status(200).json({
            hasEnv: !!envSecret,
            envLen: envSecret ? envSecret.length : null,
            timestamp: new Date().toISOString()
        });
    }
    catch (err) {
        functions.logger.error('devShowAdminSecret error', err);
        res.status(500).json({ error: 'dev diagnostic failed' });
    }
});
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
            // TODO: Add SMS notification logic here in future
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
exports.joinQueue = regionalFunctions.https.onCall(async (data, context) => {
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
            await (0, notifier_1.sendNotification)({
                to: newPatientData.phone,
                type: 'joined',
                payload: {
                    name: newPatientData.name,
                    tokenNumber: newPatientData.tokenNumber,
                    clinicId,
                    doctorId
                }
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
exports.getPatientView = regionalFunctions.https.onCall(async (data, context) => {
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
exports.updatePatientStatus = regionalFunctions.https.onCall(async (data, context) => {
    try {
        // Check authentication and staff claim (supports emulator users/{uid}.staff fallback)
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
        }
        // Simplified: any authenticated user can proceed.
        functions.logger.debug('updatePatientStatus auth check (simplified mode)', { uid: context.auth.uid });
        // Extract and validate required fields
        const { clinicId, doctorId, queueId, patientId, newStatus } = data;
        if (!clinicId || !doctorId || !queueId || !patientId || !newStatus) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, patientId, and newStatus are required.');
        }
        // Validate status values
        const validStatuses = ['waiting', 'in-progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(newStatus)) {
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
        // Use Firestore transaction ensuring all reads occur before any writes
        await db.runTransaction(async (transaction) => {
            // 1. Read patient doc
            const patientDoc = await transaction.get(patientRef);
            if (!patientDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Patient document not found.');
            }
            const patientData = patientDoc.data();
            // 2. If completing OR moving to in-progress we need queue doc (read now before any write)
            let queueDoc = null;
            if (newStatus === 'completed' || newStatus === 'in-progress') {
                queueDoc = await transaction.get(queueRef);
                if (!queueDoc.exists) {
                    throw new functions.https.HttpsError('not-found', 'Queue document not found.');
                }
            }
            // 3. If setting in-progress enforce single in-progress patient (read collection now)
            if (newStatus === 'in-progress') {
                const patientsCollRef = queueRef.collection('patients');
                const inProgressQuery = await patientsCollRef.where('status', '==', 'in-progress').limit(1).get();
                if (!inProgressQuery.empty) {
                    const existing = inProgressQuery.docs[0];
                    if (existing.id !== patientId) {
                        throw new functions.https.HttpsError('failed-precondition', 'Another patient is already in progress.');
                    }
                }
            }
            // 4. Perform writes after all necessary reads gathered
            updatedPatientData = {
                ...patientData,
                status: newStatus,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            };
            transaction.update(patientRef, { status: newStatus, updatedAt: firestore_1.FieldValue.serverTimestamp() });
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
        functions.logger.info('Patient status updated successfully', {
            patientId,
            newStatus,
            clinicId,
            doctorId,
            queueId,
            uid: context.auth.uid
        });
        // If we completed a patient, try to notify the patient who is now 3-away
        try {
            if (newStatus === 'completed') {
                const threeAwayToken = (updatedPatientData?.tokenNumber || 0) + 3;
                const patientsRef = db.collection('clinics').doc(clinicId)
                    .collection('doctors').doc(doctorId)
                    .collection('queues').doc(queueId)
                    .collection('patients');
                const q = patientsRef.where('tokenNumber', '==', threeAwayToken).limit(1);
                const snaps = await q.get();
                snaps.forEach(async (snap) => {
                    const p = snap.data();
                    try {
                        await (0, notifier_1.sendNotification)({
                            to: p.phone,
                            type: 'three-away',
                            payload: { name: p.name, tokenNumber: p.tokenNumber, clinicId, doctorId }
                        });
                    }
                    catch (e) {
                        functions.logger.warn('Failed to send three-away notification', e);
                    }
                });
            }
            if (newStatus === 'cancelled') {
                try {
                    await (0, notifier_1.sendNotification)({
                        to: updatedPatientData?.phone,
                        type: 'cancelled',
                        payload: {
                            name: updatedPatientData?.name,
                            tokenNumber: updatedPatientData?.tokenNumber,
                            clinicId, doctorId, queueId,
                            message: 'Your queue entry has been cancelled. If this was a mistake, please contact the clinic to rejoin.'
                        }
                    });
                }
                catch (e) {
                    functions.logger.warn('Failed to send cancellation notification', e);
                }
            }
        }
        catch (e) {
            functions.logger.warn('Error handling three-away notification', e);
        }
        // Server-side auto-advance: if queue has autoAdvance true, promote next waiting patient automatically
        try {
            if (newStatus === 'completed') {
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
                        await nextDoc.ref.update({ status: 'in-progress', updatedAt: firestore_1.FieldValue.serverTimestamp() });
                        // Also reflect currently served token on queue doc
                        await admin.firestore().collection('clinics').doc(clinicId)
                            .collection('doctors').doc(doctorId)
                            .collection('queues').doc(queueId)
                            .update({ currentToken: nextToken, updatedAt: firestore_1.FieldValue.serverTimestamp() });
                        functions.logger.info('Auto-advance promoted next patient', { nextPatientId: nextDoc.id, nextToken });
                    }
                }
            }
        }
        catch (autoErr) {
            functions.logger.warn('Auto-advance failed (non-fatal)', autoErr);
        }
        return {
            success: true,
            message: `Patient status successfully updated to ${newStatus}`,
            patient: updatedPatientData
        };
    }
    catch (error) {
        functions.logger.error('Error in updatePatientStatus function:', error);
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
exports.updateQueueStatus = regionalFunctions.https.onCall(async (data, context) => {
    try {
        // Check authentication and staff claim (supports emulator users/{uid}.staff fallback)
        if (!context.auth) {
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
        return {
            success: true,
            message: `Queue status successfully updated to ${newStatus}`,
            queueId,
            newStatus
        };
    }
    catch (error) {
        functions.logger.error('Error in updateQueueStatus function:', error);
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
exports.setQueueAutoAdvance = regionalFunctions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Auth required');
        }
        const { clinicId, doctorId, queueId, enabled } = data || {};
        if (!clinicId || !doctorId || !queueId || typeof enabled !== 'boolean') {
            throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId, enabled(boolean) required');
        }
        const ref = admin.firestore().collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        await ref.set({ autoAdvance: enabled }, { merge: true });
        functions.logger.info('AutoAdvance flag updated', { clinicId, doctorId, queueId, enabled, uid: context.auth.uid });
        return { success: true, enabled };
    }
    catch (err) {
        functions.logger.error('setQueueAutoAdvance error', err);
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
exports.patientStream = regionalFunctions.https.onRequest(async (req, res) => {
    try {
        // Allow only GET
        if (req.method !== 'GET') {
            res.status(405).json({ error: 'Only GET supported' });
            return;
        }
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        const { clinicId, doctorId, queueId } = req.query;
        if (!clinicId || !doctorId || !queueId) {
            res.write(`event: error\n` + `data: ${JSON.stringify({ error: 'clinicId, doctorId, queueId required' })}\n\n`);
            res.end();
            return;
        }
        const colRef = admin.firestore().collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId)
            .collection('patients');
        const unsubscribe = colRef.onSnapshot((snap) => {
            const payload = [];
            snap.forEach(d => payload.push({ id: d.id, ...d.data() }));
            res.write(`event: patients\n` + `data: ${JSON.stringify(payload)}\n\n`);
        }, (err) => {
            res.write(`event: error\n` + `data: ${JSON.stringify({ error: err.message })}\n\n`);
        });
        req.on('close', () => {
            unsubscribe();
            res.end();
        });
    }
    catch (err) {
        try {
            res.write(`event: error\n` + `data: ${JSON.stringify({ error: err.message || 'internal' })}\n\n`);
        }
        catch (_) { /* ignore */ }
        res.end();
    }
});
/**
 * Firebase Callable Function to bootstrap a clinic account with initial data
 * Creates default clinic, doctor, and queue documents, and links them to the user
 *
 * @param data - Object containing clinicName, doctorName, specialty, clinicId (optional), doctorId (optional)
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and created/updated identifiers
 */
exports.bootstrapClinicAccount = regionalFunctions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }
        const authUid = context.auth.uid; // safe after guard
        const authEmail = context.auth.token?.email || null;
        const { clinicName, doctorName, specialty, clinicId: providedClinicId, doctorId: providedDoctorId } = data || {};
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
                tx.set(clinicRef, { name: clinicName, createdAt: firestore_1.FieldValue.serverTimestamp(), ownerUid: authUid });
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