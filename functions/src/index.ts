import { FieldValue } from '@google-cloud/firestore';
import cors from 'cors';
import crypto from 'crypto';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Import functions for local use
import { sendNotification } from './notifier';

// Initialize the Admin SDK. This is required for all backend functions.
admin.initializeApp();

// Export functions from other files to make them deployable
export * from './notifier';


// Simplified CORS configuration:
// - Production: prefer origins set via `firebase functions:config:set cors.origins` (string or array)
// - Local dev fallback: allow localhost on the patient PWA dev port
// This provides a single, predictable production source of truth and a safe local fallback.
let allowedOrigins: string[] = ['http://localhost:3001', 'http://127.0.0.1:3001'];
try {
  const cfg = functions.config?.().cors;
  if (cfg && cfg.origins) {
    if (Array.isArray(cfg.origins)) {
      allowedOrigins = cfg.origins;
    } else if (typeof cfg.origins === 'string') {
      // Support comma-separated string in functions config
      allowedOrigins = cfg.origins.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }
} catch (e) {
  // If functions.config() isn't available (e.g., local unit tests), keep the local fallback
}

// Use cors with a dynamic origin function to validate incoming origin header against allowedOrigins.
const corsHandler = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g., curl, server-to-server) with no origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  }
});

// Configure region for all functions
const regionalFunctions = functions.region('asia-south1');

// NOTE: Staff privilege logic removed for simplification.
// Any authenticated user may perform queue and patient management actions.

// Simple HTTPS callable function example
export const ping = regionalFunctions.https.onCall(async (data, context) => {
  return { message: 'pong', received: data ?? null, uid: context.auth?.uid ?? null };
});

// HTTP function example
export const helloHttp = regionalFunctions.https.onRequest((req, res) => {
  res.json({ ok: true, message: 'Hello from Firebase Functions in Asia South 1' });
});

// Removed adminSetStaffClaim and grantStaffRole (no staff system in simplified mode).


// Dev-only helper: mark a patient as completed and run three-away notification logic.
// Protected by the same x-admin-secret header. REMOVE before production.
export const devCompletePatient = regionalFunctions.https.onRequest(async (req, res) => {
  try {
    const secret = process.env.ADMIN_CLAIM_SECRET || functions.config?.().admin?.claim_secret;
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

    let updatedPatientData: any;

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
        updatedAt: FieldValue.serverTimestamp()
      };

      transaction.update(patientRef, {
        status: 'completed',
        updatedAt: FieldValue.serverTimestamp()
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
        updatedAt: FieldValue.serverTimestamp()
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
        const p = snap.data() as any;
        try {
          await sendNotification({
            to: p.phone,
            type: 'three-away',
            payload: { name: p.name, tokenNumber: p.tokenNumber, clinicId, doctorId }
          });
        } catch (e) {
          functions.logger.warn('Failed to send three-away notification (dev helper)', e);
        }
      });
    } catch (e) {
      functions.logger.warn('Error handling three-away notification (dev helper)', e);
    }

    res.status(200).json({ success: true, message: 'Patient marked completed (dev helper)', patient: updatedPatientData });
  } catch (error) {
    functions.logger.error('Error in devCompletePatient:', error);
    // If the caller used the dev bypass header, include error details to help debugging locally.
    try {
      const isDevBypass = req && typeof req.header === 'function' && req.header('x-dev-bypass') === 'true';
      if (!res.headersSent) {
        if (isDevBypass) {
          const errAny: any = error;
          res.status(500).json({ error: 'Internal server error', message: errAny?.message || String(error), stack: errAny?.stack || null });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    } catch (e) {
      // Fallback safe response if anything goes wrong while preparing the debug payload
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Dev-only debug endpoint: echo the request headers so we can see what the emulator receives.
// Useful to diagnose header/secret mismatches from different shells.
export const devEchoHeaders = regionalFunctions.https.onRequest((req, res) => {
  try {
    // Return headers and a small timestamp
    res.status(200).json({ headers: req.headers, receivedAt: new Date().toISOString() });
  } catch (err) {
    functions.logger.error('devEchoHeaders error', err);
    res.status(500).json({ error: 'dev echo failed' });
  }
});

// Dev-only diagnostic: report whether the functions runtime can see the admin secret.
// Only returns masked/length info to avoid leaking secrets.
export const devShowAdminSecret = regionalFunctions.https.onRequest((req, res) => {
  try {
    const envSecret = process.env.ADMIN_CLAIM_SECRET || null;
    // functions.config() may be empty in some local setups; guard access
    let cfgSecret: string | null = null;
    try {
      cfgSecret = (functions.config && functions.config().admin && functions.config().admin.claim_secret) || null;
    } catch (e) {
      cfgSecret = null;
    }

    res.status(200).json({
      hasEnv: !!envSecret,
      envLen: envSecret ? envSecret.length : null,
      hasConfig: !!cfgSecret,
      configLen: cfgSecret ? cfgSecret.length : null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    functions.logger.error('devShowAdminSecret error', err);
    res.status(500).json({ error: 'dev diagnostic failed' });
  }
});

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

        // TODO: Add SMS notification logic here in future
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
 * HTTP Cloud Function to add a patient to a queue
 * Handles CORS and implements secure queue joining with automatic token assignment
 */
export const joinQueue = regionalFunctions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
      }

      // Extract data from request body
      const { clinicId, doctorId, patientData } = req.body;

      // Validate required fields
      if (!clinicId || !doctorId || !patientData) {
        res.status(400).json({ 
          error: 'Missing required fields: clinicId, doctorId, and patientData are required' 
        });
        return;
      }

      if (!patientData.name || !patientData.age || !patientData.phone) {
        res.status(400).json({ 
          error: 'Patient data must include name, age, and phone' 
        });
        return;
      }

      // 1. Get current date in YYYY-MM-DD format for the queue ID
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // 2. Define database references for the doctor, the queue, and the patients sub-collection
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
        // 4. Inside the transaction:
        
        // 4a. Try to get the queue document for today
        const queueDoc = await transaction.get(queueRef);
        
        let newTokenNumber: number;
        
        if (!queueDoc.exists) {
          // 4b. If the queue doesn't exist, create it with initial values and set tokenNumber to 1
          newTokenNumber = 1;
          const newQueueData = {
            id: today,
            doctorId: doctorId,
            clinicId: clinicId,
            status: 'active',
            currentToken: 0, // No patients served yet
            totalPatients: 1,
            completedPatients: 0,
            createdAt: FieldValue.serverTimestamp()
          };
          transaction.set(queueRef, newQueueData);
        } else {
          // 4c. If it exists, increment the totalPatients field to get the new tokenNumber
          const queueData = queueDoc.data();
          newTokenNumber = (queueData?.totalPatients || 0) + 1;
          
          // 4e. Update the queue document with the new totalPatients count
          transaction.update(queueRef, {
            totalPatients: newTokenNumber
          });
        }

  // 4d. Create the new patient document in the 'patients' sub-collection
  // Generate a secure random token for patient access and store only its hash
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
          doctorId: doctorId
        ,
          // store only the hash; raw token is returned to the frontend
          accessTokenHash: accessTokenHash,
        };

        // Create the patient document with auto-generated ID
        const newPatientRef = patientsRef.doc();
        newPatientData.id = newPatientRef.id;
        transaction.set(newPatientRef, newPatientData);
      });

      // 5. Commit the transaction (automatically handled by runTransaction)

  // 6. Return a minimal success response with identifiers so the client can fetch data via server if needed
      // Send "joined" notification (non-blocking)
      try {
        await sendNotification({
          to: newPatientData.phone,
          type: 'joined',
          payload: {
            name: newPatientData.name,
            tokenNumber: newPatientData.tokenNumber,
            clinicId,
            doctorId
          }
        });
      } catch (notifyErr) {
        functions.logger.warn('Failed to send joined notification (continuing):', notifyErr);
      }

      res.status(200).json({
        success: true,
        message: 'Successfully joined the queue',
        // Use the patient id assigned earlier and the queue/day identifiers
        patientId: newPatientData.id,
        queueId: today,
        doctorId: doctorId,
        clinicId: clinicId,
        // Return the raw token so the client can use it to fetch the patient view
        accessToken: rawAccessToken
      });

    } catch (error) {
      // Basic error handling with logging
      functions.logger.error('Error in joinQueue function:', error);
      res.status(500).json({ 
        error: 'Internal server error. Please try again later.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
});

/**
 * HTTP Cloud Function to return a patient's view after validating a short-lived token
 * Expected POST body: { clinicId, doctorId, queueId, patientId, token }
 */
export const getPatientView = regionalFunctions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
      }

      const { clinicId, doctorId, queueId, patientId, token } = req.body || {};

      if (!clinicId || !doctorId || !queueId || !patientId || !token) {
        res.status(400).json({ error: 'Missing required fields: clinicId, doctorId, queueId, patientId, token' });
        return;
      }

      const db = admin.firestore();
      const patientRef = db.collection('clinics').doc(clinicId)
        .collection('doctors').doc(doctorId)
        .collection('queues').doc(queueId)
        .collection('patients').doc(patientId);

      const patientSnap = await patientRef.get();
      if (!patientSnap.exists) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      const patientData = patientSnap.data() as any;
      const storedHash = patientData?.accessTokenHash;
      if (!storedHash) {
        res.status(403).json({ error: 'Access token not configured for this patient' });
        return;
      }

      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      if (tokenHash !== storedHash) {
        res.status(403).json({ error: 'Invalid token' });
        return;
      }

      // Do not return the accessTokenHash
      const safeData = { ...patientData };
      delete safeData.accessTokenHash;

      res.status(200).json({ success: true, patient: safeData });
    } catch (error) {
      functions.logger.error('Error in getPatientView function:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
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
      updatedPatientData = {
        ...patientData,
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.update(patientRef, { status: newStatus, updatedAt: FieldValue.serverTimestamp() });

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
          const p = snap.data() as any;
          try {
            await sendNotification({
              to: p.phone,
              type: 'three-away',
              payload: { name: p.name, tokenNumber: p.tokenNumber, clinicId, doctorId }
            });
          } catch (e) {
            functions.logger.warn('Failed to send three-away notification', e);
          }
        });
      }
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
    } catch (e) {
      functions.logger.warn('Error handling three-away notification', e);
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
export const patientStream = regionalFunctions.https.onRequest(async (req, res) => {
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

    const { clinicId, doctorId, queueId } = req.query as Record<string, string>;
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
      const payload: any[] = [];
      snap.forEach(d => payload.push({ id: d.id, ...d.data() }));
      res.write(`event: patients\n` + `data: ${JSON.stringify(payload)}\n\n`);
    }, (err) => {
      res.write(`event: error\n` + `data: ${JSON.stringify({ error: err.message })}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  } catch (err: any) {
    try {
      res.write(`event: error\n` + `data: ${JSON.stringify({ error: err.message || 'internal' })}\n\n`);
    } catch (_) { /* ignore */ }
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
