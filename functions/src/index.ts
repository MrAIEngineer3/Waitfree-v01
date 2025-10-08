import { FieldValue } from '@google-cloud/firestore';
// Ensure local .env variables are loaded when running in emulator / local scripts
import cors from 'cors';
import crypto from 'crypto';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import './loadEnv';

// Import functions for local use
import { recomputeQueueNotifications } from './notificationEngine';
import { sendNotification } from './notifier';

// Initialize the Admin SDK. This is required for all backend functions.
admin.initializeApp();

// Export functions from other files to make them deployable
export * from './notifier';


// Simplified CORS configuration:
// - Production: prefer origins set via Firebase functions config (cors.origins)
// - Local dev fallback: allow localhost on the patient PWA dev port
// This provides a single, predictable production source of truth and a safe local fallback.
let allowedOrigins: string[] = ['http://localhost:3001', 'http://127.0.0.1:3001'];
let configError: string | null = null;

try {
  const corsConfig = functions.config().cors;
  if (corsConfig && corsConfig.origins) {
    allowedOrigins = corsConfig.origins.split(',').map((s: string) => s.trim()).filter(Boolean);
  } else {
    configError = "Config object or origins property was missing.";
  }
} catch (e: any) {
  configError = `Error fetching functions.config(): ${e.message}`;
}

// This log runs ONCE when the function instance starts up.
// Feature flags NEW_NOTIFICATION_ENGINE / PHASE1_NOTIFICATIONS have been removed.
// Engine + Phase1 notifications are now permanently enabled (unless you change code).
console.log(`GLOBAL: Allowed origins loaded: [${allowedOrigins.join(", ")}]. Config error: ${configError || 'None'}. Notification engine + phase1 ALWAYS ENABLED (flags removed).`);

// Use cors with a dynamic origin function to validate incoming origin header against allowedOrigins.
const corsHandler = cors({
  origin: (origin, callback) => {
    // This log runs for EVERY request.
    console.log(`CORS CHECK: Request from origin [${origin}].`);
    
    if (!origin || allowedOrigins.includes(origin)) {
      console.log(`CORS VERDICT: Origin [${origin}] ALLOWED.`);
      callback(null, true);
    } else {
      console.error(`CORS VERDICT: Origin [${origin}] DENIED because it is not in [${allowedOrigins.join(", ")}].`);
      callback(null, false);
    }
  }
});

// Configure region for all functions
const regionalFunctions = functions.region('asia-south1');

/** DEBUG: Returns runtime flag visibility and Node version */
export const debugRuntimeFlags = regionalFunctions.https.onCall(async (_data, _ctx) => {
  return {
    phase1Enabled: true,
    rawPhase1: 'hardcoded:true',
    engineEnabled: true,
    rawEngine: 'hardcoded:true',
    node: process.version
  };
});

/** DEBUG: Show resolved Patient PWA base URL */
export const debugPatientPwaBaseUrl = regionalFunctions.https.onCall(async (_data, _ctx) => {
  try {
    const envVal = process.env.PATIENT_PWA_BASE_URL || null;
    let cfgVal: string | null = null;
    try {
      const cfg: any = (functions as any)?.config?.();
      cfgVal = cfg?.app?.patient_pwa_base_url || null;
    } catch {
      cfgVal = null;
    }
    const resolved = envVal || cfgVal || null;
    return { env: !!envVal, envVal, cfg: !!cfgVal, cfgVal, resolved };
  } catch (e:any) {
    return { error: e?.message || String(e) };
  }
});

/** DEBUG: Force recompute for a queue (engine default-on). data: { clinicId, doctorId, queueId } */
export const debugRecompute = regionalFunctions.https.onCall(async (data, _ctx) => {
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
  
  const result = await recomputeQueueNotifications({ clinicId, doctorId, queueId });
  return { success: true, result };
});

/** DEBUG: Fetch patient doc raw (no auth). data: { clinicId, doctorId, queueId, patientId } */
export const debugGetPatient = regionalFunctions.https.onCall(async (data, _ctx) => {
  const { clinicId, doctorId, queueId, patientId } = data || {};
  if (!clinicId || !doctorId || !queueId || !patientId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId, patientId required');
  }
  const snap = await admin.firestore().collection('clinics').doc(clinicId)
    .collection('doctors').doc(doctorId)
    .collection('queues').doc(queueId)
    .collection('patients').doc(patientId).get();
  if (!snap.exists) return { found: false };
  return { found: true, data: snap.data() };
});

// NOTE: Staff privilege logic removed for simplification.
// Any authenticated user may perform queue and patient management actions.

// Simple HTTPS callable function example
export const ping = regionalFunctions.https.onCall(async (data, context) => {
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
export const onNewPatient = regionalFunctions.firestore
  .document('patients/{patientId}')
  .onCreate(async (snap, ctx) => {
    const data = snap.data();
    functions.logger.info('New patient created', { id: ctx.params.patientId, data });
  });

/**
 * Firestore Trigger that fires when a patient's status is updated
 * Specifically monitors for status changes to 'in-progress' to send notifications
 */
export const onPatientStatusChange = regionalFunctions.firestore
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

        functions.logger.info(
          `Patient ${patientName}'s turn is next. Preparing to send notification to ${phoneNumber}.`,
          {
            patientId: context.params.patientId,
            clinicId: context.params.clinicId,
            doctorId: context.params.doctorId,
            queueId: context.params.queueId,
            patientName,
            phoneNumber,
            previousStatus: beforeData.status,
            newStatus: afterData.status
          }
        );

        // Mark and send a 'now' notification if not already sent. We record this on the patient doc
        // using a `notifications.now` flag so we don't duplicate sends.
        try {
          const patientRef = change.after.ref;
          const patientSnapLatest = await patientRef.get();
          const p = patientSnapLatest.data() as any;
          const already = p?.notifications?.now === true;
          if (!already) {
            await patientRef.set({ notifications: { ...(p?.notifications || {}), now: true } }, { merge: true });
            await sendNotification({
              to: p?.phone || 'unknown',
              type: 'now',
              payload: { name: p?.name, tokenNumber: p?.tokenNumber, clinicId: context.params.clinicId, doctorId: context.params.doctorId }
            });
          } else {
            functions.logger.info('Now notification already sent for patient', { patientId: context.params.patientId });
          }
        } catch (e) {
          functions.logger.warn('Failed to send or mark now notification', e);
        }
        return null;
      } else {
        // Status changed to something other than 'in-progress'
        functions.logger.info(
          `Status changed to ${afterData.status}. No notification sent.`,
          {
            patientId: context.params.patientId,
            previousStatus: beforeData.status,
            newStatus: afterData.status
          }
        );
        return null;
      }

    } catch (error) {
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
export const joinQueue = regionalFunctions.https.onCall(async (data, context) => {
  try {
    // Extract data from the 'data' parameter provided by the client SDK
    const { clinicId, doctorId, patientData } = data;

    // Validate required fields
    if (!clinicId || !doctorId || !patientData) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: clinicId, doctorId, and patientData are required.'
      );
    }

    if (!patientData.name || !patientData.age || !patientData.phone) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Patient data must include name, age, and phone.'
      );
    }

    // 1. Get current date in YYYY-MM-DD format for the queue ID
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // 2. Define database references
    const db = admin.firestore();
    const queueRef = db.collection('clinics').doc(clinicId)
      .collection('doctors').doc(doctorId)
      .collection('queues').doc(today);
    const patientsRef = queueRef.collection('patients');

    let newPatientData: any;
    // raw token will be generated inside the transaction and returned to client
    let rawAccessToken = '';

    // 3. Start a Firestore transaction
    await db.runTransaction(async (transaction) => {
      const queueDoc = await transaction.get(queueRef);
      let newTokenNumber: number;

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
          createdAt: FieldValue.serverTimestamp()
        };
        transaction.set(queueRef, newQueueData);
      } else {
        const queueData = queueDoc.data();
        newTokenNumber = (queueData?.totalPatients || 0) + 1;
        transaction.update(queueRef, {
          totalPatients: newTokenNumber
        });
      }

      rawAccessToken = crypto.randomBytes(32).toString('hex');
      const accessTokenHash = crypto.createHash('sha256').update(rawAccessToken).digest('hex');

      newPatientData = {
        id: '', // Will be set after document creation
        name: patientData.name,
        age: patientData.age,
        phone: patientData.phone,
        tokenNumber: newTokenNumber,
        status: 'waiting',
        joinedAt: FieldValue.serverTimestamp(),
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
      } catch (e) {
        functions.logger.warn('Failed to mark joined notification on patient doc', e);
      }

      await sendNotification({
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
      });
    } catch (notifyErr) {
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

  } catch (error) {
    functions.logger.error('Error in joinQueue function:', error);
    // Re-throw HttpsError for the client SDK to handle it correctly
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    // For other errors, throw a generic internal error
    throw new functions.https.HttpsError(
      'internal',
      'An internal error occurred while trying to join the queue.'
    );
  }
});

/**
 * Callable Cloud Function to return a patient's view after validating a short-lived token.
 * Expected data: { clinicId, doctorId, queueId, patientId, token }
 */
export const getPatientView = regionalFunctions.https.onCall(async (data, context) => {
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

    const patientData = patientSnap.data() as any;
    const storedHash = patientData?.accessTokenHash;
    if (!storedHash) {
      throw new functions.https.HttpsError('permission-denied', 'Access token not configured for this patient');
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    if (tokenHash !== storedHash) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid token');
    }

    // Do not return the accessTokenHash
    const safeData = { ...patientData };
    delete safeData.accessTokenHash;

    return { success: true, patient: safeData };
  } catch (error) {
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
export const updatePatientStatus = regionalFunctions.https.onCall(async (data, context) => {
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
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: clinicId, doctorId, queueId, patientId, and newStatus are required.'
      );
    }

    // Validate status values
    const validStatuses = ['waiting', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      );
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

  let updatedPatientData: any;
  // Phase 1 flag (defaults enabled if env not set to '0')
  const phase1Enabled = true; // Permanently enabled (feature flag removed)
  functions.logger.debug('Phase1 notifications active (permanently enabled – flags removed)', { phase1Enabled });

    // Use Firestore transaction ensuring all reads occur before any writes
    await db.runTransaction(async (transaction) => {
      // 1. Read patient doc
      const patientDoc = await transaction.get(patientRef);
      if (!patientDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Patient document not found.');
      }
      const patientData = patientDoc.data();

      // 2. If completing OR moving to in-progress we need queue doc (read now before any write)
      let queueDoc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
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
      // Prepare base update
      const baseUpdate: any = { status: newStatus, updatedAt: FieldValue.serverTimestamp() };

      // Phase 1: when moving to in-progress, set service.startedAt if not already set
      if (phase1Enabled && newStatus === 'in-progress') {
        const alreadyStarted = (patientData as any)?.service?.startedAt;
        if (!alreadyStarted) {
          baseUpdate['service'] = { ...(patientData as any)?.service, startedAt: FieldValue.serverTimestamp() };
          functions.logger.debug('Phase1 adding service.startedAt', { patientId, newStatus });
        } else {
          functions.logger.debug('Phase1 service.startedAt already present', { patientId });
        }
      }

      // Phase 1: when completing, if we have a startedAt and no completedAt yet, set completedAt and compute duration placeholder (duration computed after transaction with actual timestamps if needed)
      if (phase1Enabled && newStatus === 'completed') {
        const svc = (patientData as any)?.service || {};
        if (svc.startedAt && !svc.completedAt) {
          baseUpdate['service'] = { ...svc, completedAt: FieldValue.serverTimestamp() };
          functions.logger.debug('Phase1 setting service.completedAt placeholder', { patientId });
        } else {
          functions.logger.debug('Phase1 completed branch skipped (missing startedAt or already completedAt)', { patientId, hasStarted: !!svc.startedAt, hasCompleted: !!svc.completedAt });
        }
      }

      updatedPatientData = { ...patientData, ...baseUpdate };
      transaction.update(patientRef, baseUpdate);

      if (queueDoc) {
        const patientTokenNumber = (patientData as any)?.tokenNumber || 0;
        if (newStatus === 'completed') {
          const queueData = queueDoc.data();
            const currentCompletedPatients = queueData?.completedPatients || 0;
            transaction.update(queueRef, {
              completedPatients: currentCompletedPatients + 1,
              currentToken: patientTokenNumber, // last completed patient token
              updatedAt: FieldValue.serverTimestamp()
            });
        } else if (newStatus === 'in-progress') {
          // Update currentToken immediately when we start serving a patient to avoid UI lag on patient view
          transaction.update(queueRef, {
            currentToken: patientTokenNumber,
            updatedAt: FieldValue.serverTimestamp()
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

    // Phase 1 post-transaction logic
    // 1. If patient just completed: compute service duration & update queue avg service time; send completed notification once.
    // 2. Legacy staged notifications remain untouched for now (we append completed flow before them to avoid interfering).
    try {
      if (phase1Enabled && newStatus === 'completed') {
        const db = admin.firestore();
        const patientSnap = await db.collection('clinics').doc(clinicId)
          .collection('doctors').doc(doctorId)
          .collection('queues').doc(queueId)
          .collection('patients').doc(patientId).get();
        const latest = patientSnap.data() as any;
        const svc = latest?.service || {};
        let serviceDurationMs: number | undefined;
        if (svc.startedAt && svc.completedAt && !svc.serviceDurationMs) {
          // Compute duration locally using Timestamp seconds if available
            try {
              const startedTs: any = svc.startedAt;
              const completedTs: any = svc.completedAt;
              if (startedTs?.toMillis && completedTs?.toMillis) {
                serviceDurationMs = completedTs.toMillis() - startedTs.toMillis();
              }
            } catch (_) { /* ignore */ }
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
          await db.runTransaction(async (tx) => {
            const qDoc = await tx.get(queueRef);
            if (qDoc.exists) {
              const qd: any = qDoc.data() || {};
              const oldAvg = qd?.metrics?.avgServiceMs;
              const alpha = 0.2; // smoothing factor
              const newAvg = oldAvg ? Math.round(oldAvg * (1 - alpha) + serviceDurationMs * alpha) : serviceDurationMs;
              const metrics = { ...(qd.metrics || {}), avgServiceMs: newAvg, updatedAt: FieldValue.serverTimestamp() };
              tx.set(queueRef, { metrics }, { merge: true });
              functions.logger.debug('Phase1 updated queue avgServiceMs', { queueId, newAvg });
            }
          });
        }

        // Send completed notification if not already flagged (notifications.completed)
        const alreadyCompletedNotified = latest?.notifications?.completed === true;
        if (!alreadyCompletedNotified) {
          try {
            await patientSnap.ref.set({ notifications: { ...(latest?.notifications || {}), completed: true } }, { merge: true });
            await sendNotification({
              to: latest?.phone || 'unknown',
              type: 'completed',
              payload: {
                name: latest?.name,
                tokenNumber: latest?.tokenNumber,
                clinicId, doctorId, queueId,
                serviceDurationMs: serviceDurationMs || null
              }
            });
            functions.logger.debug('Phase1 sent completed notification', { patientId });
          } catch (e) {
            functions.logger.warn('Failed to send completed notification', e);
          }
        }
      }
    } catch (e) {
      functions.logger.warn('Phase1 completion post-processing failed (non-fatal)', e);
    }

    // Legacy staged notification logic removed (engine handles position). Only handle cancellation explicitly.
    if (newStatus === 'cancelled') {
      try {
        await sendNotification({
          to: updatedPatientData?.phone,
          type: 'cancelled',
          payload: {
            name: updatedPatientData?.name,
            tokenNumber: updatedPatientData?.tokenNumber,
            clinicId, doctorId, queueId,
            message: 'Your queue entry has been cancelled. If this was a mistake, please contact the clinic to rejoin.'
          }
        });
      } catch (e) {
        functions.logger.warn('Failed to send cancellation notification', e);
      }
    }

    // Server-side auto-advance: if queue has autoAdvance true, promote next waiting patient automatically
    try {
      if (newStatus === 'completed') {
        const queueSnap = await admin.firestore().collection('clinics').doc(clinicId)
          .collection('doctors').doc(doctorId)
          .collection('queues').doc(queueId).get();
        const qData: any = queueSnap.data() || {};
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
            const nextData = nextDoc.data() as any;
            const nextToken = nextData?.tokenNumber || 0;
            await nextDoc.ref.update({ status: 'in-progress', updatedAt: FieldValue.serverTimestamp() });
            // Also reflect currently served token on queue doc
            await admin.firestore().collection('clinics').doc(clinicId)
              .collection('doctors').doc(doctorId)
              .collection('queues').doc(queueId)
              .update({ currentToken: nextToken, updatedAt: FieldValue.serverTimestamp() });
            functions.logger.info('Auto-advance promoted next patient', { nextPatientId: nextDoc.id, nextToken });
          }
        }
      }
    } catch (autoErr) {
      functions.logger.warn('Auto-advance failed (non-fatal)', autoErr);
    }

    // Phase 2 recompute (top 3 logic) after any status transition of interest
    try {
      if (['completed','in-progress','cancelled'].includes(newStatus)) {
        functions.logger.debug('Notification engine recompute (default-on)', { clinicId, doctorId, queueId, newStatus });
        await recomputeQueueNotifications({ clinicId, doctorId, queueId });
      }
    } catch (engErr) {
      functions.logger.warn('Notification engine recompute failed (non-fatal)', { error: (engErr as any)?.message });
    }

    return {
      success: true,
      message: `Patient status successfully updated to ${newStatus}`,
      patient: updatedPatientData
    };

  } catch (error) {
    functions.logger.error('Error in updatePatientStatus function:', error);
    
    // Re-throw HttpsError for proper client handling
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Internal server error occurred while updating patient status.'
    );
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
export const updateQueueStatus = regionalFunctions.https.onCall(async (data, context) => {
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
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: clinicId, doctorId, queueId, and newStatus are required.'
      );
    }

    // Validate status values
    const validStatuses = ['active', 'paused', 'ended'];
    if (!validStatuses.includes(newStatus)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      );
    }

    // Define database reference
    const db = admin.firestore();
    const queueRef = db.collection('clinics').doc(clinicId)
      .collection('doctors').doc(doctorId)
      .collection('queues').doc(queueId);

    // Update queue status (simple write, no transaction needed)
    await queueRef.update({
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp()
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

  } catch (error) {
    functions.logger.error('Error in updateQueueStatus function:', error);
    
    // Re-throw HttpsError for proper client handling
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Internal server error occurred while updating queue status.'
    );
  }
});

/**
 * Toggle or set queue autoAdvance flag.
 * data: { clinicId, doctorId, queueId, enabled }
 */
export const setQueueAutoAdvance = regionalFunctions.https.onCall(async (data, context) => {
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
  } catch (err) {
    functions.logger.error('setQueueAutoAdvance error', err);
    if (err instanceof functions.https.HttpsError) throw err;
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
export const bootstrapClinicAccount = regionalFunctions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const authUid = context.auth.uid; // safe after guard
    const authEmail = (context.auth.token as any)?.email || null;
    const { clinicName, doctorName, specialty, clinicId: providedClinicId, doctorId: providedDoctorId } = data || {};
    if (!clinicName || !doctorName || !specialty) {
      throw new functions.https.HttpsError('invalid-argument', 'clinicName, doctorName, specialty are required');
    }
    const slugify = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'id';
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
        tx.set(clinicRef, { name: clinicName, createdAt: FieldValue.serverTimestamp(), ownerUid: authUid });
      }
      if (!doctorSnap.exists) {
        tx.set(doctorRef, { name: doctorName, specialty, clinicId, createdAt: FieldValue.serverTimestamp() });
      }
      if (!queueSnap.exists) {
        tx.set(queueRef, { status: 'active', currentToken: 0, totalPatients: 0, completedPatients: 0, autoAdvance: true, createdAt: FieldValue.serverTimestamp() });
      }

      tx.set(userRef, {
        email: authEmail,
        clinicId,
        doctorId,
        clinicName,
        doctorName,
        specialty,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: userSnap.exists ? (userSnap.get('createdAt') || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp()
      }, { merge: true });
    });

    functions.logger.info('bootstrapClinicAccount complete', { clinicId, doctorId, uid: authUid });
    return { success: true, clinicId, doctorId, queueId: today };
  } catch (err) {
    functions.logger.error('bootstrapClinicAccount error', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', 'Failed to bootstrap clinic account');
  }
});
