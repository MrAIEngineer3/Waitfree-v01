import { FieldValue } from '@google-cloud/firestore';
// Ensure local .env variables are loaded when running in emulator / local scripts
import crypto from 'crypto';
import * as functions from 'firebase-functions/v1';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { GlobalOptions } from 'firebase-functions/v2';
import './loadEnv';
import { admin } from './firebaseAdmin';

// Import functions for local use
import { recomputeQueueNotifications } from './notificationEngine';
import { sendNotification } from './notifier';
import {
  createDoctorScheduleOverride as applyCreateScheduleOverride,
  deleteDoctorScheduleOverride as applyDeleteScheduleOverride,
  NotFoundError as SchedulingNotFoundError,
  setDoctorRealTimeStatus as applySetDoctorRealTimeStatus,
  updateDoctorDefaultRota as applyUpdateDoctorDefaultRota,
  updateDoctorScheduleOverride as applyUpdateScheduleOverride,
  ValidationError as SchedulingValidationError
} from './scheduling/mutations';
import { dispatchDoctorOnlineNotifications } from './scheduling/notificationQueue';
import { resolveDoctorAvailability, resolveManyDoctorAvailability } from './scheduling/availability';
import { loadClinicSchedulingSettings, saveClinicSchedulingSettings } from './scheduling/settings';
import type { DoctorAvailabilityResult, ScheduleOverride } from './scheduling/types';
import { startTiming } from './utils/timing';
import { createRequestDoctorOnlineNotificationHandler } from './scheduling/requestDoctorOnlineNotification';

// Export functions from other files to make them deployable
export * from './notifier';
export * from './scheduling';


// Simplified CORS configuration:
// - Production: prefer origins supplied via environment variable CORS_ALLOWED_ORIGINS
// - Local dev fallback: allow localhost on the patient PWA dev port
// This provides a single, predictable production source of truth and a safe local fallback.
const defaultAllowedOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001'];
let allowedOrigins: string[] = defaultAllowedOrigins;
let allowedOriginsSource = 'defaults';

const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
if (allowedOriginsEnv && allowedOriginsEnv.trim().length > 0) {
  allowedOrigins = allowedOriginsEnv.split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedOrigins.length > 0) {
    allowedOriginsSource = 'env:CORS_ALLOWED_ORIGINS';
  } else {
    allowedOrigins = defaultAllowedOrigins;
  }
}

// This log runs ONCE when the function instance starts up.
// Feature flags NEW_NOTIFICATION_ENGINE / PHASE1_NOTIFICATIONS have been removed.
// Engine + Phase1 notifications are now permanently enabled (unless you change code).
console.log(`GLOBAL: Allowed origins loaded (${allowedOriginsSource}): [${allowedOrigins.join(", ")}]. Notification engine + phase1 ALWAYS ENABLED (flags removed).`);

const runInBackground = (taskName: string, task: () => Promise<unknown>) => {
  setImmediate(() => {
    const span = startTiming(`runInBackground.${taskName}`, { taskName });
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
        } else {
          functions.logger.warn(`${taskName} failed (background)`, { error: err });
        }
      });
    } catch (err) {
      span.fail({
        error: err instanceof Error ? err.message : String(err)
      });
      if (err instanceof Error) {
        functions.logger.warn(`${taskName} failed (background-sync)`, { message: err.message, stack: err.stack });
      } else {
        functions.logger.warn(`${taskName} failed (background-sync)`, { error: err });
      }
    }
  });
};

// Use cors with a dynamic origin function to validate incoming origin header against allowedOrigins.
// CORS is not needed for callable functions, so removed.

// Configure region for all functions
const regionalFunctions = functions.region('asia-south1');

// Runtime options keep latency in check; warm pools opt-in via environment if required later.
const callableTimeoutSeconds = 60;
const callableMemory = '512MiB';

const minInstancesEnv = process.env.FUNCTIONS_MIN_INSTANCES;
const parsedMinInstances = minInstancesEnv ? Number(minInstancesEnv) : NaN;
let warmPoolMinInstances: number | undefined;
if (!Number.isNaN(parsedMinInstances) && parsedMinInstances > 0) {
  warmPoolMinInstances = parsedMinInstances;
  console.log(`Runtime warm pool enabled with minInstances=${parsedMinInstances}`);
} else {
  console.log('Runtime warm pool disabled; using on-demand scaling.');
}

const v2GlobalOptions: GlobalOptions = {
  region: 'asia-south1',
  timeoutSeconds: callableTimeoutSeconds,
  memory: callableMemory
};
if (typeof warmPoolMinInstances === 'number') {
  v2GlobalOptions.minInstances = warmPoolMinInstances;
}
setGlobalOptions(v2GlobalOptions);

type CallableCtx = functions.https.CallableContext;
const adaptCallableContext = <T>(request: CallableRequest<T>): CallableCtx => {
  type CallableAuth = NonNullable<CallableCtx['auth']>;
  let auth: CallableCtx['auth'] = request.auth as CallableCtx['auth'];
  if (!auth) {
    const rawHeaders = request.rawRequest?.headers || {};
    const fallback = (rawHeaders as Record<string, unknown>)['x-callable-context-auth'];
    if (typeof fallback === 'string') {
      try {
        const decoded = decodeURIComponent(fallback);
        const parsed = JSON.parse(decoded) as CallableAuth;
        auth = parsed;
      } catch (err) {
        functions.logger.warn('Failed to parse x-callable-context-auth header', {
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  return {
    auth,
    app: request.app,
    instanceIdToken: request.instanceIdToken,
    rawRequest: request.rawRequest
  };
};

const createV2Callable = <T>(handler: (data: T, context: CallableCtx) => Promise<any> | any) =>
  onCall<T>((request: CallableRequest<T>) => handler(request.data, adaptCallableContext(request)));

const mapSchedulingError = (error: unknown, action: string): never => {
  if (error instanceof SchedulingValidationError) {
    throw new functions.https.HttpsError('invalid-argument', error.message);
  }
  if (error instanceof SchedulingNotFoundError) {
    throw new functions.https.HttpsError('not-found', error.message);
  }
  functions.logger.error(`Scheduling action ${action} failed`, {
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    action
  });
  throw new functions.https.HttpsError('internal', `Failed to ${action}`);
};

const sanitizeFirestoreId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return /^[A-Za-z0-9-_.~]+$/.test(trimmed) ? trimmed : null;
};

const serializeOverride = (override: ScheduleOverride | null | undefined) => {
  if (!override) {
    return null;
  }
  const base = {
    id: override.id,
    type: override.type,
    start: override.start.toDate().toISOString(),
    end: override.end.toDate().toISOString(),
    note: override.note ?? null,
    createdAt: override.createdAt ? override.createdAt.toDate().toISOString() : null,
    updatedAt: override.updatedAt ? override.updatedAt.toDate().toISOString() : null
  };
  if (override.type === 'blocker') {
    return {
      ...base,
      reasonCode: override.reasonCode ?? null
    };
  }
  return {
    ...base,
    label: override.label ?? null
  };
};

const serializeAvailability = (result: DoctorAvailabilityResult) => {
  return {
    status: result.status,
    layer: result.layer,
    reasonCode: result.reasonCode,
    message: result.message ?? null,
    computedAt: result.computedAt.toISOString(),
    nextAvailableAt: result.nextAvailableAt ? result.nextAvailableAt.toISOString() : null,
    activeOverride: serializeOverride(result.activeOverride ?? null),
    realTimeStatus: result.realTimeStatus
      ? {
          online: result.realTimeStatus.online,
          note: result.realTimeStatus.note ?? null,
          source: result.realTimeStatus.source ?? null,
          updatedAt: result.realTimeStatus.updatedAt
            ? result.realTimeStatus.updatedAt.toDate().toISOString()
            : null
        }
      : null,
    debug: result.debug ?? null
  };
};

const hashAccessToken = (token: string) => crypto.createHash('sha256').update(String(token)).digest('hex');

type JoinQueueRequest = {
  clinicId?: string;
  doctorId?: string;
  patientData?: {
    name?: string;
    age?: number;
    phone?: string;
  };
};

type GetPatientViewRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  patientId?: string;
  token?: string;
};

type UpdatePatientStatusRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  patientId?: string;
  newStatus?: string;
};

type PatientStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled';

type UpdateQueueStatusRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  newStatus?: string;
};

type SetQueueAutoAdvanceRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  enabled?: boolean;
};

type AdvanceQueueRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
};

type ManualAddPatientRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  patient?: {
    name?: string;
    age?: number;
    phone?: string;
  };
  suppressNotification?: boolean;
};

type ManualAddPatientResponse = {
  success: true;
  patientId: string;
  queueId: string;
  doctorId: string;
  clinicId: string;
  accessToken: string;
  tokenNumber: number;
};

type BootstrapClinicAccountRequest = {
  clinicName?: string;
  doctorName?: string;
  specialty?: string;
  clinicId?: string;
  doctorId?: string;
  clinicPhone?: string;
};

type SetRealTimeStatusRequest = {
  clinicId?: string;
  doctorId?: string;
  online?: boolean;
  note?: string;
  source?: 'staff' | 'system' | 'automation';
};

type UpdateDefaultRotaRequest = {
  clinicId?: string;
  doctorId?: string;
  timeZone?: string;
  week?: Record<string, { start: string; end: string; label?: string | null }[]>;
};

type BaseOverrideRequest = {
  clinicId?: string;
  doctorId?: string;
  overrideId?: string;
  type?: 'blocker' | 'exception';
  start?: string;
  end?: string;
  note?: string;
};

type CreateOverrideRequest =
  | (BaseOverrideRequest & { type: 'blocker'; reasonCode?: string | null })
  | (BaseOverrideRequest & { type: 'exception'; label?: string | null });

type RequestDoctorOnlineNotification = {
  clinicId?: string;
  doctorId?: string;
  patientName?: string;
  phone?: string;
};

type GetClinicDoctorAvailabilityRequest = {
  clinicId?: string;
  doctorIds?: string[];
};

type GetClinicSchedulingSettingsRequest = {
  clinicId?: string;
};

type UpdateClinicSchedulingSettingsRequest = {
  clinicId?: string;
  manualCheckInRequired?: boolean;
  allowOfflineSignups?: boolean;
};

type PatientCancelTokenRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  patientId?: string;
  token?: string;
};

type PatientCancelTokenResult = {
  success: boolean;
  status: PatientStatus;
  alreadyCancelled?: boolean;
  message?: string;
};

type PatientRejoinQueueRequest = PatientCancelTokenRequest;

type PatientRejoinQueueResult = {
  success: boolean;
  status: PatientStatus;
  message?: string;
  rejoin?: {
    clinicId: string;
    doctorId: string;
    queueId: string;
    patientId: string;
    accessToken: string;
  };
};

/** DEBUG: Returns runtime flag visibility and Node version */
const debugRuntimeFlagsHandler = async (_data: unknown, _ctx: CallableCtx) => {
  return {
    phase1Enabled: true,
    rawPhase1: 'hardcoded:true',
    engineEnabled: true,
    rawEngine: 'hardcoded:true',
    node: process.version
  };
};
export const debugRuntimeFlags = createV2Callable(debugRuntimeFlagsHandler);

/** DEBUG: Show resolved Patient PWA base URL */
const debugPatientPwaBaseUrlHandler = async (_data: unknown, _ctx: CallableCtx) => {
  try {
    const envValRaw = process.env.PATIENT_PWA_BASE_URL;
    const envVal = envValRaw && envValRaw.trim().length > 0 ? envValRaw.trim() : null;
    const resolved = envVal;
    return { env: !!envVal, envVal, resolved };
  } catch (e:any) {
    return { error: e?.message || String(e) };
  }
};
export const debugPatientPwaBaseUrl = createV2Callable(debugPatientPwaBaseUrlHandler);

/** DEBUG: Force recompute for a queue (engine default-on). data: { clinicId, doctorId, queueId } */
const debugRecomputeHandler = async (data: any, _ctx: CallableCtx) => {
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
};
export const debugRecompute = createV2Callable(debugRecomputeHandler);

/** DEBUG: Fetch patient doc raw (no auth). data: { clinicId, doctorId, queueId, patientId } */
const debugGetPatientHandler = async (data: any, _ctx: CallableCtx) => {
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
};
export const debugGetPatient = createV2Callable(debugGetPatientHandler);

// NOTE: Staff privilege logic removed for simplification.
// Any authenticated user may perform queue and patient management actions.

// Simple HTTPS callable function example
const pingHandler = async (data: unknown, context: CallableCtx) => {
  return { message: 'pong', received: data ?? null, uid: context.auth?.uid ?? null };
};
export const ping = createV2Callable(pingHandler);

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
const joinQueueHandler = async (data: JoinQueueRequest, _context: CallableCtx) => {
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

    const availability = await resolveDoctorAvailability({
      clinicId,
      doctorId
    });

    if (availability.status !== 'AVAILABLE') {
      const serialized = serializeAvailability(availability);
      functions.logger.info('joinQueue blocked: doctor unavailable', {
        clinicId,
        doctorId,
        availability: serialized
      });
      throw new functions.https.HttpsError(
        'failed-precondition',
        availability.message ?? 'Doctor is currently unavailable.',
        { availability: serialized }
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
};

export const joinQueue = createV2Callable(joinQueueHandler);

const manualAddPatientHandler = async (data: ManualAddPatientRequest, context: CallableCtx): Promise<ManualAddPatientResponse> => {
  const authUid = context.auth?.uid ?? null;
  const span = startTiming('manualAddPatient', {
    uid: authUid,
    clinicId: data?.clinicId ?? null,
    doctorId: data?.doctorId ?? null,
    queueId: data?.queueId ?? null,
    suppressNotification: data?.suppressNotification === true
  });

  try {
    if (!context.auth) {
      span.fail({ reason: 'unauthenticated' });
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const uid = context.auth.uid;

    const clinicId = sanitizeFirestoreId(data?.clinicId);
    const doctorId = sanitizeFirestoreId(data?.doctorId);
    const queueId = sanitizeFirestoreId(data?.queueId);

    if (!clinicId || !doctorId || !queueId) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, and queueId are required');
    }

    const patientInput = data?.patient ?? {};
    const rawName = typeof patientInput.name === 'string' ? patientInput.name.trim() : '';
    if (!rawName) {
      span.fail({ reason: 'invalid-name' });
      throw new functions.https.HttpsError('invalid-argument', 'Patient name is required');
    }

    let age: number | null = null;
    if (patientInput.age != null) {
      const parsedAge = Number(patientInput.age);
      if (!Number.isFinite(parsedAge) || parsedAge <= 0 || parsedAge > 200) {
        span.fail({ reason: 'invalid-age', provided: patientInput.age });
        throw new functions.https.HttpsError('invalid-argument', 'Patient age must be between 1 and 200');
      }
      age = Math.round(parsedAge);
    }

    let phone: string | null = null;
    if (typeof patientInput.phone === 'string') {
      const trimmedPhone = patientInput.phone.trim();
      if (trimmedPhone.length > 0) {
        const digitsOnly = trimmedPhone.replace(/\D+/g, '');
        if (digitsOnly.length !== 10) {
          span.fail({ reason: 'invalid-phone', providedLength: digitsOnly.length });
          throw new functions.https.HttpsError('invalid-argument', 'Phone number must contain exactly 10 digits');
        }
        phone = digitsOnly;
      }
    }

    const suppressNotification = data?.suppressNotification === true;

    const db = admin.firestore();
    const queueRef = db.collection('clinics').doc(clinicId)
      .collection('doctors').doc(doctorId)
      .collection('queues').doc(queueId);
    const patientsRef = queueRef.collection('patients');

    let newPatientId = '';
    let newTokenNumber = 0;
    let rawAccessToken = '';

    await db.runTransaction(async (transaction) => {
      const queueSnap = await transaction.get(queueRef);
      const queueData = queueSnap.exists ? (queueSnap.data() as { status?: string; totalPatients?: number } | undefined) : undefined;

      if (queueData && typeof queueData.status === 'string' && (queueData.status === 'ended' || queueData.status === 'closed')) {
        throw new functions.https.HttpsError('failed-precondition', 'Queue has ended. New patients cannot be added.');
      }

      if (!queueSnap.exists) {
        newTokenNumber = 1;
        transaction.set(queueRef, {
          id: queueId,
          doctorId,
          clinicId,
          status: 'active',
          currentToken: 0,
          totalPatients: newTokenNumber,
          completedPatients: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        const currentTotal = queueData?.totalPatients ?? 0;
        newTokenNumber = currentTotal + 1;
        transaction.update(queueRef, {
          totalPatients: newTokenNumber,
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      const patientRef = patientsRef.doc();
      newPatientId = patientRef.id;
      rawAccessToken = crypto.randomBytes(32).toString('hex');
      const accessTokenHash = crypto.createHash('sha256').update(rawAccessToken).digest('hex');

      const patientDoc: Record<string, unknown> = {
        id: newPatientId,
        name: rawName,
        tokenNumber: newTokenNumber,
        status: 'waiting',
        joinedAt: FieldValue.serverTimestamp(),
        queueId,
        clinicId,
        doctorId,
        accessTokenHash,
  createdBy: uid,
        createdVia: 'staff'
      };

      if (age !== null) {
        patientDoc.age = age;
      }
      patientDoc.phone = phone ?? '';

      if (suppressNotification) {
        patientDoc.notifications = { joinedSuppressed: true };
      }

      transaction.set(patientRef, patientDoc);
    });

    const patientDocRef = queueRef.collection('patients').doc(newPatientId);

    if (phone && !suppressNotification) {
      try {
        await patientDocRef.set({ notifications: { joined: true } }, { merge: true });
        await sendNotification({
          to: phone,
          type: 'joined',
          payload: {
            name: rawName,
            tokenNumber: newTokenNumber,
            clinicId,
            doctorId,
            queueId,
            patientId: newPatientId,
            accessToken: rawAccessToken
          }
        });
      } catch (notifyErr) {
        functions.logger.warn('Failed to send manual joined notification', notifyErr);
      }
    } else if (suppressNotification) {
      try {
        await patientDocRef.set({ notifications: { joinedSuppressed: true } }, { merge: true });
      } catch (notifyFlagErr) {
        functions.logger.warn('Failed to record notification suppression flag', notifyFlagErr);
      }
    }

    runInBackground('manualAddPatient.recompute', () => recomputeQueueNotifications({ clinicId, doctorId, queueId }));

    functions.logger.info('Manual patient added', {
      clinicId,
      doctorId,
      queueId,
      patientId: newPatientId,
      tokenNumber: newTokenNumber,
      suppressNotification,
      uid
    });

    span.succeed({ patientId: newPatientId, tokenNumber: newTokenNumber });

    return {
      success: true,
      patientId: newPatientId,
      queueId,
      doctorId,
      clinicId,
      accessToken: rawAccessToken,
      tokenNumber: newTokenNumber
    } satisfies ManualAddPatientResponse;
  } catch (error) {
    functions.logger.error('manualAddPatient failed', error, {
      clinicId: data?.clinicId ?? null,
      doctorId: data?.doctorId ?? null,
      queueId: data?.queueId ?? null,
      uid: authUid
    });
    span.fail({ error: error instanceof Error ? error.message : String(error) });
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to manually add patient');
  }
};

export const manualAddPatient = createV2Callable(manualAddPatientHandler);

/**
 * Callable Cloud Function to return a patient's view after validating a short-lived token.
 * Expected data: { clinicId, doctorId, queueId, patientId, token }
 */
const getPatientViewHandler = async (data: GetPatientViewRequest, _context: CallableCtx) => {
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
};

export const getPatientView = createV2Callable(getPatientViewHandler);

/**
 * Firebase Callable Function to update a patient's status in the queue
 * Requires authentication and handles queue metadata updates when patients are completed
 * 
 * @param data - Object containing clinicId, doctorId, queueId, patientId, and newStatus
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and updated patient data
 */
const updatePatientStatusHandler = async (data: UpdatePatientStatusRequest, context: CallableCtx) => {
  const span = startTiming('updatePatientStatus', {
    uid: context.auth?.uid ?? null,
    clinicId: data?.clinicId,
    doctorId: data?.doctorId,
    queueId: data?.queueId,
    newStatus: data?.newStatus
  });
  let autoAdvancePromoted = false;
  let recomputeTriggered = false;
  let phase1DurationMs: number | null = null;
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
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: clinicId, doctorId, queueId, patientId, and newStatus are required.'
      );
    }

    // Validate status values
    const validStatuses = ['waiting', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      span.fail({ reason: 'invalid-status', provided: newStatus });
      spanClosed = true;
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
    const txnSpan = startTiming('updatePatientStatus.transaction', {
      clinicId,
      doctorId,
      queueId,
      patientId,
      newStatus
    });
    try {
      await db.runTransaction(async (transaction) => {
      // 1. Read patient doc
      const readPatientSpan = startTiming('updatePatientStatus.transaction.readPatient', {
        clinicId,
        doctorId,
        queueId,
        patientId
      });
      let patientDoc: admin.firestore.DocumentSnapshot<admin.firestore.DocumentData>;
      try {
        patientDoc = await transaction.get(patientRef);
        readPatientSpan.succeed({ found: patientDoc.exists });
      } catch (readErr) {
        readPatientSpan.fail({ error: readErr instanceof Error ? readErr.message : String(readErr) });
        throw readErr;
      }
      if (!patientDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Patient document not found.');
      }
      const patientData = patientDoc.data();

      // 2. If completing OR moving to in-progress we need queue doc (read now before any write)
      let queueDoc: admin.firestore.DocumentSnapshot<admin.firestore.DocumentData> | null = null;
      if (newStatus === 'completed' || newStatus === 'in-progress') {
        const readQueueSpan = startTiming('updatePatientStatus.transaction.readQueue', {
          clinicId,
          doctorId,
          queueId,
          newStatus
        });
        try {
          queueDoc = await transaction.get(queueRef);
          readQueueSpan.succeed({ found: queueDoc.exists });
        } catch (queueErr) {
          readQueueSpan.fail({ error: queueErr instanceof Error ? queueErr.message : String(queueErr) });
          throw queueErr;
        }
        if (!queueDoc.exists) {
          throw new functions.https.HttpsError('not-found', 'Queue document not found.');
        }
      }

      // 3. If setting in-progress enforce single in-progress patient (read collection now)
      if (newStatus === 'in-progress') {
        const guardSpan = startTiming('updatePatientStatus.transaction.inProgressGuard', {
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
          } else {
            guardSpan.succeed({ conflictsFound: 0 });
          }
        } catch (guardErr) {
          if (!(guardErr instanceof functions.https.HttpsError && guardErr.code === 'failed-precondition')) {
            guardSpan.fail({ error: guardErr instanceof Error ? guardErr.message : String(guardErr) });
          }
          throw guardErr;
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
      txnSpan.succeed({});
    } catch (txnError) {
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
        const phaseSpan = startTiming('updatePatientStatus.phase1Completion', {
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
            } catch {
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
            const emaSpan = startTiming('updatePatientStatus.phase1Completion.updateQueueAvg', {
              clinicId,
              doctorId,
              queueId,
              patientId
            });
            try {
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
                  emaSpan.succeed({ newAvg });
                } else {
                  emaSpan.succeed({ skipped: 'queue-missing' });
                }
              });
            } catch (emaErr) {
              emaSpan.fail({ error: emaErr instanceof Error ? emaErr.message : String(emaErr) });
              throw emaErr;
            }
          }

          // Send completed notification if not already flagged (notifications.completed)
          const alreadyCompletedNotified = latest?.notifications?.completed === true;
          if (!alreadyCompletedNotified) {
            const completedSpan = startTiming('updatePatientStatus.phase1Completion.completedNotification', {
              clinicId,
              doctorId,
              queueId,
              patientId
            });
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
              completedSpan.succeed({});
            } catch (e) {
              completedSpan.fail({ error: e instanceof Error ? e.message : String(e) });
              functions.logger.warn('Failed to send completed notification', e);
            }
          }

          const phaseFinished = process.hrtime.bigint();
          phase1DurationMs = Number(phaseFinished - phaseStarted) / 1_000_000;
          phaseSpan.succeed({ serviceDurationMs: serviceDurationMs ?? null });
        } catch (phaseErr) {
          phaseSpan.fail({ error: phaseErr instanceof Error ? phaseErr.message : String(phaseErr) });
          throw phaseErr;
        }
      }
    } catch (e) {
      if (phase1DurationMs === null) {
        phase1DurationMs = 0;
      }
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
        const autoSpan = startTiming('updatePatientStatus.autoAdvance', {
          clinicId,
          doctorId,
          queueId,
          patientId
        });
        try {
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
              await Promise.all([
                nextDoc.ref.update({ status: 'in-progress', updatedAt: FieldValue.serverTimestamp() }),
                queueRef.update({ currentToken: nextToken, updatedAt: FieldValue.serverTimestamp() })
              ]);
              functions.logger.info('Auto-advance promoted next patient', { nextPatientId: nextDoc.id, nextToken });
              autoAdvancePromoted = true;
            }
          }
          autoSpan.succeed({ promoted: autoAdvancePromoted });
        } catch (autoInnerErr) {
          autoSpan.fail({ error: autoInnerErr instanceof Error ? autoInnerErr.message : String(autoInnerErr) });
          throw autoInnerErr;
        }
      }
    } catch (autoErr) {
      functions.logger.warn('Auto-advance failed (non-fatal)', autoErr);
      autoAdvancePromoted = false;
    }

    // Phase 2 recompute (top 3 logic) after any status transition of interest
    if (['completed','in-progress','cancelled'].includes(newStatus)) {
      functions.logger.debug('Notification engine recompute (default-on)', { clinicId, doctorId, queueId, newStatus });
      runInBackground('notificationEngine.recompute', () => recomputeQueueNotifications({ clinicId, doctorId, queueId }));
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

  } catch (error) {
    functions.logger.error('Error in updatePatientStatus function:', error);
    if (!spanClosed) {
      span.fail({ error: error instanceof Error ? error.message : String(error) });
      spanClosed = true;
    }
    
    // Re-throw HttpsError for proper client handling
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Internal server error occurred while updating patient status.'
    );
  }
};

export const updatePatientStatus = createV2Callable(updatePatientStatusHandler);

let updatePatientStatusForCancel: typeof updatePatientStatusHandler = updatePatientStatusHandler;

const patientCancelTokenHandler = async (data: PatientCancelTokenRequest, _context: CallableCtx): Promise<PatientCancelTokenResult> => {
  const span = startTiming('patientCancelToken', {
    clinicId: data?.clinicId ?? null,
    doctorId: data?.doctorId ?? null,
    queueId: data?.queueId ?? null,
    patientId: data?.patientId ?? null
  });

  try {
    const clinicId = sanitizeFirestoreId(data?.clinicId);
    const doctorId = sanitizeFirestoreId(data?.doctorId);
    const queueId = sanitizeFirestoreId(data?.queueId);
    const patientId = sanitizeFirestoreId(data?.patientId);
    const token = typeof data?.token === 'string' ? data.token.trim() : '';

    if (!clinicId || !doctorId || !queueId || !patientId || !token) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }

    if (token.length < 32 || token.length > 512) {
      span.fail({ reason: 'invalid-token-length', length: token.length });
      throw new functions.https.HttpsError('invalid-argument', 'Invalid token.');
    }

    const db = admin.firestore();
    const patientRef = db
      .collection('clinics').doc(clinicId)
      .collection('doctors').doc(doctorId)
      .collection('queues').doc(queueId)
      .collection('patients').doc(patientId);

    const patientSnap = await patientRef.get();
    if (!patientSnap.exists) {
      span.fail({ reason: 'not-found' });
      throw new functions.https.HttpsError('not-found', 'Patient not found.');
    }

    const patientData = patientSnap.data() as Record<string, any> | undefined;
    const storedHash = patientData?.accessTokenHash;
    if (!storedHash) {
      span.fail({ reason: 'missing-access-token-hash' });
      throw new functions.https.HttpsError('permission-denied', 'Invalid token.');
    }

    const incomingHash = hashAccessToken(token);
    if (incomingHash !== storedHash) {
      span.fail({ reason: 'token-mismatch' });
      throw new functions.https.HttpsError('permission-denied', 'Invalid token.');
    }

    if (typeof patientData?.queueId === 'string' && patientData.queueId !== queueId) {
      span.fail({ reason: 'queue-mismatch' });
      throw new functions.https.HttpsError('permission-denied', 'Invalid token.');
    }

    const currentStatus = (patientData?.status as PatientStatus | undefined) ?? 'waiting';

    if (currentStatus === 'cancelled') {
      const existingCancellation = (patientData?.cancellation ?? {}) as Record<string, any>;
      if (!existingCancellation?.cancelledAt) {
        try {
          await patientRef.set({
            cancellation: {
              ...existingCancellation,
              cancelledAt: FieldValue.serverTimestamp(),
              cancelledBy: existingCancellation?.cancelledBy ?? 'patient-self'
            }
          }, { merge: true });
        } catch (patchErr) {
          functions.logger.warn('Failed to backfill cancellation metadata', patchErr, { clinicId, doctorId, queueId, patientId });
        }
      }

      span.succeed({ status: 'already-cancelled' });
      return {
        success: true,
        status: 'cancelled',
        alreadyCancelled: true,
        message: 'Token already cancelled.'
      } satisfies PatientCancelTokenResult;
    }

    if (currentStatus !== 'waiting') {
      span.fail({ reason: 'status-not-waiting', status: currentStatus });
      throw new functions.https.HttpsError('failed-precondition', 'Token cannot be cancelled right now.');
    }

    const syntheticContext = {
      auth: { uid: `patient-self:${patientId}` } as any
    } as CallableCtx;

  await updatePatientStatusForCancel({ clinicId, doctorId, queueId, patientId, newStatus: 'cancelled' }, syntheticContext);

    const existingCancellation = (patientData?.cancellation ?? {}) as Record<string, any>;
    const cancellationPatch: Record<string, unknown> = {
      cancellation: {
        ...existingCancellation,
        cancelledBy: 'patient-self'
      }
    };
    if (!existingCancellation?.cancelledAt) {
      (cancellationPatch.cancellation as Record<string, unknown>).cancelledAt = FieldValue.serverTimestamp();
    }

    try {
      await patientRef.set(cancellationPatch, { merge: true });
    } catch (patchErr) {
      functions.logger.warn('Failed to record cancellation metadata', patchErr, { clinicId, doctorId, queueId, patientId });
    }

    span.succeed({ status: 'cancelled' });
    return {
      success: true,
      status: 'cancelled',
      message: 'Token cancelled.'
    } satisfies PatientCancelTokenResult;
  } catch (error) {
    functions.logger.error('patientCancelToken failed', error, {
      clinicId: data?.clinicId ?? null,
      doctorId: data?.doctorId ?? null,
      queueId: data?.queueId ?? null,
      patientId: data?.patientId ?? null
    });
    span.fail({ error: error instanceof Error ? error.message : String(error) });

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', 'Failed to cancel token.');
  }
};

export const patientCancelToken = createV2Callable(patientCancelTokenHandler);

const patientRejoinQueueHandler = async (data: PatientRejoinQueueRequest, _context: CallableCtx): Promise<PatientRejoinQueueResult> => {
  const span = startTiming('patientRejoinQueue', {
    clinicId: data?.clinicId ?? null,
    doctorId: data?.doctorId ?? null,
    queueId: data?.queueId ?? null,
    patientId: data?.patientId ?? null
  });

  try {
    const clinicId = sanitizeFirestoreId(data?.clinicId);
    const doctorId = sanitizeFirestoreId(data?.doctorId);
    const queueId = sanitizeFirestoreId(data?.queueId);
    const patientId = sanitizeFirestoreId(data?.patientId);
    const token = typeof data?.token === 'string' ? data.token.trim() : '';

    if (!clinicId || !doctorId || !queueId || !patientId || !token) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }

    const db = admin.firestore();
    const patientRef = db
      .collection('clinics').doc(clinicId)
      .collection('doctors').doc(doctorId)
      .collection('queues').doc(queueId)
      .collection('patients').doc(patientId);

    const patientSnap = await patientRef.get();
    if (!patientSnap.exists) {
      span.fail({ reason: 'not-found' });
      throw new functions.https.HttpsError('not-found', 'Patient not found.');
    }

    const patientData = patientSnap.data() as Record<string, any> | undefined;
    const storedHash = patientData?.accessTokenHash;
    if (!storedHash) {
      span.fail({ reason: 'missing-access-token-hash' });
      throw new functions.https.HttpsError('permission-denied', 'Invalid token.');
    }

    const incomingHash = hashAccessToken(token);
    if (incomingHash !== storedHash) {
      span.fail({ reason: 'token-mismatch' });
      throw new functions.https.HttpsError('permission-denied', 'Invalid token.');
    }

    if (typeof patientData?.queueId === 'string' && patientData.queueId !== queueId) {
      span.fail({ reason: 'queue-mismatch' });
      throw new functions.https.HttpsError('permission-denied', 'Invalid token.');
    }

    const currentStatus = (patientData?.status as PatientStatus | undefined) ?? 'waiting';

    if (currentStatus === 'waiting') {
      span.succeed({ status: 'already-waiting' });
      return {
        success: true,
        status: 'waiting',
        message: 'You are already in the queue.'
      } satisfies PatientRejoinQueueResult;
    }

    if (currentStatus !== 'cancelled') {
      span.fail({ reason: 'status-not-cancelled', status: currentStatus });
      throw new functions.https.HttpsError('failed-precondition', 'Token cannot be rejoined right now.');
    }

    const name = typeof patientData?.name === 'string' ? patientData.name.trim() : '';
    if (!name) {
      span.fail({ reason: 'missing-name' });
      throw new functions.https.HttpsError('failed-precondition', 'Patient information is incomplete. Please join again from the clinic link.');
    }

    const ageRaw = patientData?.age;
    const ageNumber = typeof ageRaw === 'number' ? ageRaw : Number(ageRaw);
    if (!Number.isFinite(ageNumber) || ageNumber <= 0 || ageNumber > 200) {
      span.fail({ reason: 'invalid-age', provided: ageRaw });
      throw new functions.https.HttpsError('failed-precondition', 'Patient information is incomplete. Please join again from the clinic link.');
    }

    const phoneRaw = typeof patientData?.phone === 'string' ? patientData.phone : '';
    const normalizedPhone = phoneRaw.replace(/\D+/g, '');
    if (normalizedPhone.length !== 10) {
      span.fail({ reason: 'invalid-phone' });
      throw new functions.https.HttpsError('failed-precondition', 'Patient information is incomplete. Please join again from the clinic link.');
    }

    const joinResult = await joinQueueHandler({
      clinicId,
      doctorId,
      patientData: {
        name,
        age: ageNumber,
        phone: normalizedPhone
      }
    }, {} as CallableCtx);

    const existingCancellation = (patientData?.cancellation ?? {}) as Record<string, any>;
    const cancellationPatch: Record<string, unknown> = {
      cancellation: {
        ...existingCancellation,
        rejoinedAt: FieldValue.serverTimestamp(),
        rejoinedPatientId: joinResult.patientId,
        rejoinedQueueId: joinResult.queueId
      }
    };
    if (!existingCancellation?.cancelledAt) {
      (cancellationPatch.cancellation as Record<string, unknown>).cancelledAt = FieldValue.serverTimestamp();
    }

    try {
      await patientRef.set(cancellationPatch, { merge: true });
    } catch (patchErr) {
      functions.logger.warn('Failed to record rejoin metadata', patchErr, { clinicId, doctorId, queueId, patientId });
    }

    span.succeed({ status: 'waiting', queueId: joinResult.queueId, patientId: joinResult.patientId });
    return {
      success: true,
      status: 'waiting',
      message: 'Rejoined queue.',
      rejoin: {
        clinicId: joinResult.clinicId,
        doctorId: joinResult.doctorId,
        queueId: joinResult.queueId,
        patientId: joinResult.patientId,
        accessToken: joinResult.accessToken ?? ''
      }
    } satisfies PatientRejoinQueueResult;
  } catch (error) {
    functions.logger.error('patientRejoinQueue failed', error, {
      clinicId: data?.clinicId ?? null,
      doctorId: data?.doctorId ?? null,
      queueId: data?.queueId ?? null,
      patientId: data?.patientId ?? null
    });
    span.fail({ error: error instanceof Error ? error.message : String(error) });

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', 'Failed to rejoin queue.');
  }
};

export const patientRejoinQueue = createV2Callable(patientRejoinQueueHandler);

export const __test__ = {
  patientCancelTokenHandler,
  setUpdatePatientStatusForCancel(delegate: typeof updatePatientStatusHandler) {
    updatePatientStatusForCancel = delegate;
  },
  resetDelegates() {
    updatePatientStatusForCancel = updatePatientStatusHandler;
  }
};

const createStatusUpdateHandler = (targetStatus: PatientStatus) =>
  async (data: UpdatePatientStatusRequest, context: CallableCtx) => {
    return updatePatientStatusHandler({ ...data, newStatus: targetStatus }, context);
  };

export const callPatient = createV2Callable(createStatusUpdateHandler('in-progress'));
export const completePatient = createV2Callable(createStatusUpdateHandler('completed'));
export const cancelPatient = createV2Callable(createStatusUpdateHandler('cancelled'));
export const uncallPatient = createV2Callable(createStatusUpdateHandler('waiting'));

const advanceQueueHandler = async (data: AdvanceQueueRequest, context: CallableCtx) => {
  const span = startTiming('advanceQueue', {
    uid: context.auth?.uid ?? null,
    clinicId: data?.clinicId,
    doctorId: data?.doctorId,
    queueId: data?.queueId
  });

  try {
    if (!context.auth) {
      span.fail({ reason: 'unauthenticated' });
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
    }

    const { clinicId, doctorId, queueId } = data || {};
    if (!clinicId || !doctorId || !queueId) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, and queueId are required');
    }

    const db = admin.firestore();
    const queueRef = db.collection('clinics').doc(clinicId)
      .collection('doctors').doc(doctorId)
      .collection('queues').doc(queueId);

    const queueSnap = await queueRef.get();
    if (!queueSnap.exists) {
      span.fail({ reason: 'not-found' });
      throw new functions.https.HttpsError('not-found', 'Queue document not found.');
    }

    const queueData = queueSnap.data() as { status?: string } | undefined;
    if (queueData?.status === 'paused' || queueData?.status === 'ended' || queueData?.status === 'closed') {
      span.fail({ reason: 'failed-precondition', status: queueData.status ?? null });
      throw new functions.https.HttpsError('failed-precondition', 'Queue is not active.');
    }

    const patientsCollection = queueRef.collection('patients');

    let completedPatientId: string | null = null;
    const inProgressSnap = await patientsCollection
      .where('status', '==', 'in-progress')
      .orderBy('tokenNumber')
      .limit(1)
      .get();

    if (!inProgressSnap.empty) {
      const docSnap = inProgressSnap.docs[0];
      completedPatientId = docSnap.id;
      await updatePatientStatusHandler({ clinicId, doctorId, queueId, patientId: completedPatientId, newStatus: 'completed' }, context);
    }

    let promotedPatientId: string | null = null;
    const waitingSnap = await patientsCollection
      .where('status', '==', 'waiting')
      .orderBy('tokenNumber')
      .limit(1)
      .get();

    if (!waitingSnap.empty) {
      const docSnap = waitingSnap.docs[0];
      promotedPatientId = docSnap.id;
      await updatePatientStatusHandler({ clinicId, doctorId, queueId, patientId: promotedPatientId, newStatus: 'in-progress' }, context);
    }

    if (!completedPatientId && !promotedPatientId) {
      span.succeed({ success: false, completedPatientId, promotedPatientId });
      return {
        success: false,
        message: 'No patients to advance',
        completedPatientId: null,
        promotedPatientId: null
      };
    }

    span.succeed({ success: true, completedPatientId, promotedPatientId });
    return {
      success: true,
      completedPatientId,
      promotedPatientId
    };
  } catch (error) {
    functions.logger.error('advanceQueue failed', error, {
      clinicId: data?.clinicId,
      doctorId: data?.doctorId,
      queueId: data?.queueId,
      uid: context.auth?.uid ?? null
    });
    span.fail({ error: error instanceof Error ? error.message : String(error) });
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to advance queue');
  }
};

export const advanceQueue = createV2Callable(advanceQueueHandler);

/**
 * Firebase Callable Function to update a queue's status
 * Requires authentication and allows clinic staff to control queue state
 * 
 * @param data - Object containing clinicId, doctorId, queueId, and newStatus
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and updated queue data
 */
const updateQueueStatusHandler = async (data: UpdateQueueStatusRequest, _context: CallableCtx) => {
  const span = startTiming('updateQueueStatus', {
    uid: _context.auth?.uid ?? null,
    clinicId: data?.clinicId,
    doctorId: data?.doctorId,
    queueId: data?.queueId,
    newStatus: data?.newStatus
  });
  try {
    // Check authentication and staff claim (supports emulator users/{uid}.staff fallback)
    if (!_context.auth) {
      span.fail({ reason: 'unauthenticated' });
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
    }
    // Simplified: any authenticated user can proceed.
    functions.logger.debug('updateQueueStatus auth check (simplified mode)', { uid: _context.auth.uid });

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
      uid: _context.auth.uid
    });
    span.succeed({});

    return {
      success: true,
      message: `Queue status successfully updated to ${newStatus}`,
      queueId,
      newStatus
    };

  } catch (error) {
    functions.logger.error('Error in updateQueueStatus function:', error);
    span.fail({ error: error instanceof Error ? error.message : String(error) });
    
    // Re-throw HttpsError for proper client handling
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Internal server error occurred while updating queue status.'
    );
  }
};

export const updateQueueStatus = createV2Callable(updateQueueStatusHandler);

/**
 * Toggle or set queue autoAdvance flag.
 * data: { clinicId, doctorId, queueId, enabled }
 */
const setQueueAutoAdvanceHandler = async (data: SetQueueAutoAdvanceRequest, _context: CallableCtx) => {
  const span = startTiming('setQueueAutoAdvance', {
    uid: _context.auth?.uid ?? null,
    clinicId: data?.clinicId,
    doctorId: data?.doctorId,
    queueId: data?.queueId,
    enabled: data?.enabled
  });
  try {
    if (!_context.auth) {
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
    functions.logger.info('AutoAdvance flag updated', { clinicId, doctorId, queueId, enabled, uid: _context.auth.uid });
    span.succeed({});
    return { success: true, enabled };
  } catch (err) {
    functions.logger.error('setQueueAutoAdvance error', err);
    span.fail({ error: err instanceof Error ? err.message : String(err) });
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', 'Failed to update autoAdvance');
  }
};

export const setQueueAutoAdvance = createV2Callable(setQueueAutoAdvanceHandler);

const setRealTimeStatusHandler = async (data: SetRealTimeStatusRequest, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  if (typeof data?.online !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'online must be a boolean');
  }

  const clinicId = typeof data?.clinicId === 'string' ? data.clinicId.trim() : '';
  const doctorId = typeof data?.doctorId === 'string' ? data.doctorId.trim() : '';

  try {
    const result = await applySetDoctorRealTimeStatus({
      clinicId,
      doctorId,
      online: data.online,
      note: data?.note,
      source: data?.source
    });

    const transitionedToOnline =
      result.changed &&
      result.previousStatus?.online === false &&
      result.updatedStatus.online === true;

    if (transitionedToOnline) {
      runInBackground('doctorOnlineNotificationDispatch', async () => {
        await dispatchDoctorOnlineNotifications({ clinicId, doctorId });
      });
    }

    return {
      success: true,
      changed: result.changed,
      previousStatus: result.previousStatus,
      updatedStatus: result.updatedStatus,
      effectiveAt: new Date().toISOString()
    };
  } catch (error) {
    mapSchedulingError(error, 'set real-time status');
  }
};

export const setDoctorRealTimeStatus = createV2Callable(setRealTimeStatusHandler);

const getClinicDoctorAvailabilityHandler = async (data: GetClinicDoctorAvailabilityRequest, _context: CallableCtx) => {
  if (!data || typeof data !== 'object') {
    throw new functions.https.HttpsError('invalid-argument', 'Request payload must be an object');
  }

  const clinicId = sanitizeFirestoreId(data.clinicId);
  if (!clinicId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId is required');
  }

  const providedDoctorIds = Array.isArray(data.doctorIds) ? data.doctorIds : undefined;
  const sanitizedDoctorIds = providedDoctorIds
    ? providedDoctorIds
        .map((value) => sanitizeFirestoreId(value))
        .filter((value): value is string => typeof value === 'string')
    : [];

  if (providedDoctorIds && sanitizedDoctorIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'doctorIds must contain valid Firestore identifiers');
  }

  const uniqueDoctorIds = Array.from(new Set(sanitizedDoctorIds));

  const db = admin.firestore();
  const clinicRef = db.collection('clinics').doc(clinicId);

  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Clinic not found');
  }

  const doctorsCollection = clinicRef.collection('doctors');
  const doctorMetadata = new Map<string, Record<string, unknown> | null>();

  const extractDoctorProfile = (raw: Record<string, unknown> | null) => {
    if (!raw) {
      return null;
    }
    const name = typeof raw['name'] === 'string' ? (raw['name'] as string) : null;
    const specialty = typeof raw['specialty'] === 'string' ? (raw['specialty'] as string) : null;
    const avatarUrl = typeof raw['photoUrl'] === 'string' ? (raw['photoUrl'] as string) : null;

    if (!name && !specialty && !avatarUrl) {
      return null;
    }

    return {
      name,
      specialty,
      avatarUrl
    };
  };

  let targetDoctorIds = uniqueDoctorIds;

  if (targetDoctorIds.length > 0) {
    await Promise.all(
      targetDoctorIds.map(async (doctorId) => {
        const snap = await doctorsCollection.doc(doctorId).get();
        if (snap.exists) {
          doctorMetadata.set(doctorId, snap.data() ?? {});
        } else {
          doctorMetadata.set(doctorId, null);
        }
      })
    );
  } else {
    const snapshot = await doctorsCollection.get();
    targetDoctorIds = snapshot.docs.map((doc) => {
      doctorMetadata.set(doc.id, doc.data() ?? {});
      return doc.id;
    });
  }

  if (targetDoctorIds.length === 0) {
    return {
      clinicId,
      count: 0,
      doctors: [],
      requestedDoctorIds: providedDoctorIds ? [] : undefined
    };
  }

  const availabilityResults = await resolveManyDoctorAvailability({
    clinicId,
    doctorIds: targetDoctorIds
  });

  const doctors = availabilityResults.map((result) => {
    const metadata = doctorMetadata.get(result.doctorId) ?? null;
    const profile = extractDoctorProfile(metadata);

    return {
      doctorId: result.doctorId,
      profile,
      availability: serializeAvailability(result)
    };
  });

  return {
    clinicId,
    count: doctors.length,
    doctors,
    requestedDoctorIds: providedDoctorIds ? targetDoctorIds : undefined
  };
};

export const getClinicDoctorAvailability = createV2Callable(getClinicDoctorAvailabilityHandler);

const getClinicSchedulingSettingsHandler = async (
  data: GetClinicSchedulingSettingsRequest,
  _context: CallableCtx
) => {
  const clinicId = sanitizeFirestoreId(data?.clinicId);
  if (!clinicId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId is required');
  }

  const settings = await loadClinicSchedulingSettings(clinicId);

  return {
    clinicId,
    settings
  };
};

export const getClinicSchedulingSettings = createV2Callable(getClinicSchedulingSettingsHandler);

const updateClinicSchedulingSettingsHandler = async (
  data: UpdateClinicSchedulingSettingsRequest,
  context: CallableCtx
) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const clinicId = sanitizeFirestoreId(data?.clinicId);
  if (!clinicId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId is required');
  }

  const settings = await saveClinicSchedulingSettings(clinicId, {
    manualCheckInRequired: data?.manualCheckInRequired,
    allowOfflineSignups: data?.allowOfflineSignups
  });

  functions.logger.info('Clinic scheduling settings updated', {
    clinicId,
    manualCheckInRequired: settings.manualCheckInRequired,
    allowOfflineSignups: settings.allowOfflineSignups,
    uid: context.auth?.uid ?? null
  });

  return {
    clinicId,
    settings
  };
};

export const updateClinicSchedulingSettings = createV2Callable(updateClinicSchedulingSettingsHandler);

const requestDoctorOnlineNotificationHandler = createRequestDoctorOnlineNotificationHandler();

export const requestDoctorOnlineNotification = createV2Callable(requestDoctorOnlineNotificationHandler);

const updateDefaultRotaHandler = async (data: UpdateDefaultRotaRequest, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const clinicId = typeof data?.clinicId === 'string' ? data.clinicId.trim() : '';
  const doctorId = typeof data?.doctorId === 'string' ? data.doctorId.trim() : '';
  const timeZone = typeof data?.timeZone === 'string' ? data.timeZone.trim() : '';
  const week = (data?.week as Record<string, { start: string; end: string; label?: string | null }> | undefined) ?? {};

  try {
    const rota = await applyUpdateDoctorDefaultRota({
      clinicId,
      doctorId,
      timeZone,
      week
    });

    return {
      success: true,
      rota
    };
  } catch (error) {
    mapSchedulingError(error, 'update default rota');
  }
};

export const updateDoctorDefaultRota = createV2Callable(updateDefaultRotaHandler);

const createOverrideHandler = async (data: CreateOverrideRequest, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const payload: any = {
    clinicId: typeof data?.clinicId === 'string' ? data.clinicId.trim() : '',
    doctorId: typeof data?.doctorId === 'string' ? data.doctorId.trim() : '',
    type: data?.type,
    start: data?.start,
    end: data?.end,
    note: data?.note,
    overrideId: typeof data?.overrideId === 'string' ? data.overrideId.trim() || undefined : undefined
  };

  if (data?.type === 'blocker') {
    payload.reasonCode = data.reasonCode ?? null;
  }
  if (data?.type === 'exception') {
    payload.label = data.label ?? null;
  }

  try {
    const result = await applyCreateScheduleOverride(payload);
    return {
      success: true,
      overrideId: result.id,
      override: result.override
    };
  } catch (error) {
    mapSchedulingError(error, 'create schedule override');
  }
};

export const createDoctorScheduleOverride = createV2Callable(createOverrideHandler);

const updateOverrideHandler = async (data: CreateOverrideRequest, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const payload: any = {
    clinicId: typeof data?.clinicId === 'string' ? data.clinicId.trim() : '',
    doctorId: typeof data?.doctorId === 'string' ? data.doctorId.trim() : '',
    overrideId: typeof data?.overrideId === 'string' ? data.overrideId.trim() : undefined,
    type: data?.type,
    start: data?.start,
    end: data?.end,
    note: data?.note
  };

  if (data?.type === 'blocker') {
    payload.reasonCode = data.reasonCode ?? null;
  }
  if (data?.type === 'exception') {
    payload.label = data.label ?? null;
  }

  try {
    const result = await applyUpdateScheduleOverride(payload);
    return {
      success: true,
      overrideId: result.id,
      override: result.override
    };
  } catch (error) {
    mapSchedulingError(error, 'update schedule override');
  }
};

export const updateDoctorScheduleOverride = createV2Callable(updateOverrideHandler);

const deleteOverrideHandler = async (data: { clinicId?: string; doctorId?: string; overrideId?: string }, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const clinicId = typeof data?.clinicId === 'string' ? data.clinicId.trim() : '';
  const doctorId = typeof data?.doctorId === 'string' ? data.doctorId.trim() : '';
  const overrideId = typeof data?.overrideId === 'string' ? data.overrideId.trim() : '';

  try {
    const result = await applyDeleteScheduleOverride({ clinicId, doctorId, overrideId });
    return { success: result.deleted };
  } catch (error) {
    mapSchedulingError(error, 'delete schedule override');
  }
};

export const deleteDoctorScheduleOverride = createV2Callable(deleteOverrideHandler);

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
const bootstrapClinicAccountHandler = async (data: BootstrapClinicAccountRequest, _context: CallableCtx) => {
  try {
    if (!_context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const authUid = _context.auth.uid; // safe after guard
    const authEmail = (_context.auth.token as any)?.email || null;
  const { clinicName, doctorName, specialty, clinicId: providedClinicId, doctorId: providedDoctorId, clinicPhone } = data || {};
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
        tx.set(clinicRef, { name: clinicName, createdAt: FieldValue.serverTimestamp(), ownerUid: authUid, contactNumber: clinicPhone || null });
      } else if (clinicPhone) {
        tx.set(clinicRef, { contactNumber: clinicPhone }, { merge: true });
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
};

export const bootstrapClinicAccount = createV2Callable(bootstrapClinicAccountHandler);
