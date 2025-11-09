import type { DocumentData, DocumentReference, DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
// Ensure local .env variables are loaded when running in emulator / local scripts
import crypto from 'crypto';
import * as functions from 'firebase-functions/v1';
import type { GlobalOptions } from 'firebase-functions/v2';
import { setGlobalOptions } from 'firebase-functions/v2';
import type { CallableOptions, CallableRequest } from 'firebase-functions/v2/https';
import { onCall } from 'firebase-functions/v2/https';
import { admin } from './firebaseAdmin';
import './loadEnv';

// Import functions for local use
import { recomputeQueueNotifications } from './notificationEngine';
import { sendNotification } from './notifier';
import type { PatientMetadataInput, PatientResolverFlagSnapshot, PatientResolverResult, QueuePatientLink } from './patients';
import {
    buildQueuePatientLink,
    currentPatientResolverFlagSnapshot,
    isPatientResolverV1Enabled,
    normalizePatientFullName,
    resolvePatientForQueue
} from './patients';
import { resolveDoctorAvailability, resolveManyDoctorAvailability } from './scheduling/availability';
import {
    createDoctorScheduleOverride as applyCreateScheduleOverride,
    deleteDoctorScheduleOverride as applyDeleteScheduleOverride,
    setDoctorRealTimeStatus as applySetDoctorRealTimeStatus,
    updateDoctorDefaultRota as applyUpdateDoctorDefaultRota,
    updateDoctorScheduleOverride as applyUpdateScheduleOverride,
    NotFoundError as SchedulingNotFoundError,
    ValidationError as SchedulingValidationError
} from './scheduling/mutations';
import { dispatchDoctorOnlineNotifications } from './scheduling/notificationQueue';
import { createRequestDoctorOnlineNotificationHandler } from './scheduling/requestDoctorOnlineNotification';
import { loadClinicSchedulingSettings, saveClinicSchedulingSettings } from './scheduling/settings';
import type { DoctorAvailabilityResult, ScheduleOverride } from './scheduling/types';
import { isNotificationEnabled } from './settings/notificationPreferences';
import { PatientValidationError, sanitizePatientInput } from './utils/patient';
import { startTiming } from './utils/timing';


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

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_TIME_LENGTH = 10;
const ULID_RANDOM_LENGTH = 16;

const encodeTimeComponent = (time: number): string => {
  let remaining = time;
  let str = '';
  for (let i = 0; i < ULID_TIME_LENGTH; i += 1) {
    const mod = remaining % ULID_ALPHABET.length;
    str = ULID_ALPHABET[mod] + str;
    remaining = Math.floor(remaining / ULID_ALPHABET.length);
  }
  return str;
};

const encodeRandomComponent = (): string => {
  const bytes = crypto.randomBytes(ULID_RANDOM_LENGTH);
  let str = '';
  for (let i = 0; i < ULID_RANDOM_LENGTH; i += 1) {
    const value = bytes[i] % ULID_ALPHABET.length;
    str += ULID_ALPHABET[value];
  }
  return str;
};

const generateUlid = (): string => `${encodeTimeComponent(Date.now())}${encodeRandomComponent()}`;

const ANALYTICS_EVENTS_COLLECTION = 'analyticsEvents';

const sanitizeAnalyticsParams = (params: Record<string, unknown>): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      cleaned[key] = null;
      continue;
    }
    if (typeof value === 'string') {
      cleaned[key] = value.slice(0, 128);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      cleaned[key] = value;
      continue;
    }
    try {
      cleaned[key] = JSON.stringify(value);
    } catch {
      cleaned[key] = String(value);
    }
  }
  return cleaned;
};

const recordAnalyticsEvent = async (eventName: string, params: Record<string, unknown>): Promise<void> => {
  try {
    const db = admin.firestore();
    const docId = generateUlid();
    await db.collection(ANALYTICS_EVENTS_COLLECTION).doc(docId).set({
      eventName,
      params: sanitizeAnalyticsParams(params),
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    functions.logger.warn('Failed to record analytics event', {
      eventName,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

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

type ResolverPersistenceContext = {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  source: 'joinQueue' | 'manualAddPatient';
};

// Persist resolver metadata without blocking the main response path.
const persistResolverDataAsync = (
  docRef: DocumentReference<DocumentData>,
  update: Record<string, unknown>,
  context: ResolverPersistenceContext
) => {
  runInBackground(`patientResolver.persist.${context.source}`, async () => {
    const span = startTiming('patientResolver.persist', {
      clinicId: context.clinicId,
      doctorId: context.doctorId,
      queueId: context.queueId,
      patientId: context.patientId,
      source: context.source
    });
    try {
      await docRef.set(update, { merge: true });
      span.succeed({ persisted: true });
      functions.logger.debug('Patient resolver data persisted', context);
    } catch (err) {
      span.fail({ error: err instanceof Error ? err.message : String(err) });
      functions.logger.warn('Failed to persist patient resolver data', {
        ...context,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
};

type Phase1CompletionOptions = {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  patientDocRef: DocumentReference<DocumentData>;
  queueDocRef: DocumentReference<DocumentData>;
  preloadedPatientSnap?: DocumentSnapshot<DocumentData> | null;
  preloadedQueueSnap?: DocumentSnapshot<DocumentData> | null;
};

const schedulePhase1CompletionProcessing = (
  db: Firestore,
  options: Phase1CompletionOptions
) => {
  runInBackground('updatePatientStatus.phase1Completion', async () => {
    const span = startTiming('updatePatientStatus.phase1Completion', {
      clinicId: options.clinicId,
      doctorId: options.doctorId,
      queueId: options.queueId,
      patientId: options.patientId,
      mode: 'background'
    });
    const phaseStarted = process.hrtime.bigint();
    let serviceDurationMs: number | undefined;
    let waitDurationMs: number | undefined;
    try {
      const patientSnap = options.preloadedPatientSnap ?? (await options.patientDocRef.get());
      const latest = patientSnap.data() as any;
      const svc = latest?.service || {};

      if (svc.startedAt && svc.completedAt && !svc.serviceDurationMs) {
        try {
          if (typeof svc.startedAt.toMillis === 'function' && typeof svc.completedAt.toMillis === 'function') {
            serviceDurationMs = svc.completedAt.toMillis() - svc.startedAt.toMillis();
          }
        } catch (err) {
          functions.logger.warn('Failed to compute service duration', {
            clinicId: options.clinicId,
            doctorId: options.doctorId,
            queueId: options.queueId,
            patientId: options.patientId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      const joinedAtValue = latest?.joinedAt;
      if (!waitDurationMs && svc.startedAt && typeof svc.startedAt.toMillis === 'function' && joinedAtValue && typeof joinedAtValue.toMillis === 'function') {
        try {
          const startedAtMs = svc.startedAt.toMillis();
          const joinedAtMs = joinedAtValue.toMillis();
          if (startedAtMs > joinedAtMs) {
            waitDurationMs = startedAtMs - joinedAtMs;
          }
        } catch (err) {
          functions.logger.warn('Failed to compute wait duration', {
            clinicId: options.clinicId,
            doctorId: options.doctorId,
            queueId: options.queueId,
            patientId: options.patientId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      if (serviceDurationMs && serviceDurationMs > 0 && !svc.serviceDurationMs) {
        try {
          await patientSnap.ref.set({ service: { ...svc, serviceDurationMs } }, { merge: true });
          functions.logger.debug('Phase1 wrote serviceDurationMs (background)', {
            patientId: options.patientId,
            serviceDurationMs
          });
        } catch (err) {
          functions.logger.warn('Phase1 failed to persist serviceDurationMs', {
            clinicId: options.clinicId,
            doctorId: options.doctorId,
            queueId: options.queueId,
            patientId: options.patientId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      const shouldUpdateMetrics = (serviceDurationMs && serviceDurationMs > 0) || (waitDurationMs && waitDurationMs > 0);
      if (shouldUpdateMetrics) {
        const emaSpan = startTiming('updatePatientStatus.phase1Completion.updateQueueAvg', {
          clinicId: options.clinicId,
          doctorId: options.doctorId,
          queueId: options.queueId,
          patientId: options.patientId,
          serviceDurationMs: serviceDurationMs ?? null,
          waitDurationMs: waitDurationMs ?? null
        });
        try {
          await db.runTransaction(async (tx) => {
            const qDoc = await tx.get(options.queueDocRef);
            if (!qDoc.exists) {
              return;
            }
            const qd: any = qDoc.data() || {};
            const metricsBefore: Record<string, any> = { ...(qd.metrics || {}) };
            const alpha = 0.2;

            const updates: Record<string, unknown> = {};

            if (serviceDurationMs && serviceDurationMs > 0) {
              const previousTotalService = typeof metricsBefore.totalServiceMs === 'number' ? metricsBefore.totalServiceMs : 0;
              const previousServiceSamples = typeof metricsBefore.serviceSamples === 'number' ? metricsBefore.serviceSamples : 0;
              const updatedServiceTotal = previousTotalService + serviceDurationMs;
              const updatedServiceSamples = previousServiceSamples + 1;
              const existingEma = typeof metricsBefore.avgServiceMs === 'number' ? metricsBefore.avgServiceMs : null;
              const newEma = existingEma ? Math.round(existingEma * (1 - alpha) + serviceDurationMs * alpha) : serviceDurationMs;
              updates.totalServiceMs = updatedServiceTotal;
              updates.serviceSamples = updatedServiceSamples;
              updates.avgServiceMs = newEma;
            }

            if (waitDurationMs && waitDurationMs > 0) {
              const previousTotalWait = typeof metricsBefore.totalWaitMs === 'number' ? metricsBefore.totalWaitMs : 0;
              const previousWaitSamples = typeof metricsBefore.waitSamples === 'number' ? metricsBefore.waitSamples : 0;
              const updatedWaitTotal = previousTotalWait + waitDurationMs;
              const updatedWaitSamples = previousWaitSamples + 1;
              const existingWaitAvg = typeof metricsBefore.avgWaitMs === 'number' ? metricsBefore.avgWaitMs : null;
              const newWaitAvg = existingWaitAvg ? Math.round(existingWaitAvg * (1 - alpha) + waitDurationMs * alpha) : waitDurationMs;
              updates.totalWaitMs = updatedWaitTotal;
              updates.waitSamples = updatedWaitSamples;
              updates.avgWaitMs = newWaitAvg;
            }

            if (Object.keys(updates).length === 0) {
              return;
            }

            updates.updatedAt = FieldValue.serverTimestamp();
            const metricsPayload: Record<string, unknown> = {
              ...(qd.metrics || {}),
            };
            for (const [key, value] of Object.entries(updates)) {
              metricsPayload[key] = value;
            }
            tx.set(options.queueDocRef, { metrics: metricsPayload }, { merge: true });
            functions.logger.debug('Phase1 updated queue metrics (background)', {
              queueId: options.queueId,
              serviceDurationMs: serviceDurationMs ?? null,
              waitDurationMs: waitDurationMs ?? null,
              updates
            });
          });
          emaSpan.succeed({ updated: true });
        } catch (err) {
          emaSpan.fail({ error: err instanceof Error ? err.message : String(err) });
          functions.logger.warn('Phase1 failed to update queue metrics', {
            clinicId: options.clinicId,
            doctorId: options.doctorId,
            queueId: options.queueId,
            patientId: options.patientId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      const latestPatient = latest || {};
      const alreadyCompletedNotified = latestPatient?.notifications?.completed === true;
      if (!alreadyCompletedNotified) {
        runInBackground('updatePatientStatus.completedNotification', async () => {
          const completedSpan = startTiming('updatePatientStatus.phase1Completion.completedNotification', {
            clinicId: options.clinicId,
            doctorId: options.doctorId,
            queueId: options.queueId,
            patientId: options.patientId
          });
          try {
            const canSendCompleted = await isNotificationEnabled({
              clinicId: options.clinicId,
              channel: 'whatsapp',
              event: 'tokenUpdates'
            });

            if (!canSendCompleted) {
              functions.logger.info('Skipping completed notification because clinic disabled token updates', {
                clinicId: options.clinicId,
                doctorId: options.doctorId,
                queueId: options.queueId,
                patientId: options.patientId
              });
              completedSpan.succeed({ skipped: 'disabled-by-preferences' });
              return;
            }

            try {
              await patientSnap.ref.set({ notifications: { ...(latestPatient?.notifications || {}), completed: true } }, { merge: true });
            } catch (flagErr) {
              functions.logger.warn('Failed to mark completed notification flag', {
                clinicId: options.clinicId,
                doctorId: options.doctorId,
                queueId: options.queueId,
                patientId: options.patientId,
                error: flagErr instanceof Error ? flagErr.message : String(flagErr)
              });
            }

            await sendNotification({
              to: latestPatient?.phone || 'unknown',
              type: 'completed',
              payload: {
                name: latestPatient?.name,
                tokenNumber: latestPatient?.tokenNumber,
                clinicId: options.clinicId,
                doctorId: options.doctorId,
                queueId: options.queueId,
                serviceDurationMs: serviceDurationMs || null
              }
            });
            functions.logger.debug('Phase1 sent completed notification (background)', { patientId: options.patientId });
            completedSpan.succeed({});
          } catch (err) {
            completedSpan.fail({ error: err instanceof Error ? err.message : String(err) });
            functions.logger.warn('Failed to send completed notification', err);
          }
        });
      }

      const phaseFinished = process.hrtime.bigint();
      const durationMs = Number(phaseFinished - phaseStarted) / 1_000_000;
      span.succeed({ serviceDurationMs: serviceDurationMs ?? null, durationMs });
    } catch (err) {
      span.fail({ error: err instanceof Error ? err.message : String(err) });
      functions.logger.warn('Phase1 completion background processing failed', err, {
        clinicId: options.clinicId,
        doctorId: options.doctorId,
        queueId: options.queueId,
        patientId: options.patientId
      });
    }
  });
};

type AutoAdvanceOptions = {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  queueDocRef: DocumentReference<DocumentData>;
  preloadedQueueSnap?: DocumentSnapshot<DocumentData> | null;
};

const scheduleAutoAdvancePromotion = (
  db: Firestore,
  options: AutoAdvanceOptions
) => {
  runInBackground('updatePatientStatus.autoAdvance', async () => {
    const autoSpan = startTiming('updatePatientStatus.autoAdvance', {
      clinicId: options.clinicId,
      doctorId: options.doctorId,
      queueId: options.queueId,
      patientId: options.patientId,
      mode: 'background'
    });
    try {
      const queueSnap = options.preloadedQueueSnap ?? (await options.queueDocRef.get());
      if (!queueSnap.exists) {
        autoSpan.succeed({ skipped: 'queue-missing' });
        return;
      }

      const qData: any = queueSnap.data() || {};
      if (qData.autoAdvance !== true || qData.status === 'ended' || qData.status === 'paused') {
        autoSpan.succeed({ skipped: 'auto-advance-disabled' });
        return;
      }

      const patientsCollection = options.queueDocRef.collection('patients');
      const nextSnap = await patientsCollection
        .where('status', '==', 'waiting')
        .orderBy('tokenNumber')
        .limit(1)
        .get();

      if (nextSnap.empty) {
        autoSpan.succeed({ promoted: false });
        return;
      }

      const nextDoc = nextSnap.docs[0];
      const nextData = nextDoc.data() as any;
      const nextToken = nextData?.tokenNumber || 0;

      await Promise.all([
        nextDoc.ref.update({ status: 'in-progress', updatedAt: FieldValue.serverTimestamp() }),
        options.queueDocRef.update({ currentToken: nextToken, updatedAt: FieldValue.serverTimestamp() })
      ]);

      functions.logger.info('Auto-advance promoted next patient (background)', {
        nextPatientId: nextDoc.id,
        nextToken,
        clinicId: options.clinicId,
        doctorId: options.doctorId,
        queueId: options.queueId
      });
      autoSpan.succeed({ promoted: true, nextPatientId: nextDoc.id });
    } catch (err) {
      autoSpan.fail({ error: err instanceof Error ? err.message : String(err) });
      functions.logger.warn('Auto-advance failed (background)', err, {
        clinicId: options.clinicId,
        doctorId: options.doctorId,
        queueId: options.queueId,
        patientId: options.patientId
      });
    }
  });
};

// Use cors with a dynamic origin function to validate incoming origin header against allowedOrigins.
// CORS is not needed for callable functions, so removed.

// Configure region for all functions
const regionalFunctions = functions.region('asia-south1');

// Runtime options keep latency in check; warm pools opt-in via environment if required later.
// CRITICAL HIGH-TRAFFIC functions: Maximum resources for user-facing operations
const callableTimeoutSeconds = 60;
const criticalMemory = '1GiB';
const criticalCpu = 1;
const callableMaxInstances = 1;

// Standard functions: Moderate resources for general operations
const standardMemory = '512MiB';
const standardCpu = 0.5;

// Less frequently used functions: Minimal resources to stay within quota
const lessFrequentMemory = '256MiB';
const lessFrequentCpu = 0.25;

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
  memory: standardMemory,  // Default to standard tier
  cpu: standardCpu,        // 0.5 CPU for most functions
  maxInstances: callableMaxInstances
};
if (typeof warmPoolMinInstances === 'number') {
  v2GlobalOptions.minInstances = warmPoolMinInstances;
}
setGlobalOptions(v2GlobalOptions);

// Export functions from other files to make them deployable
export * from './analytics/dailySummary';
export * from './analytics/retention';
export * from './notifier';
export * from './scheduling';

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

const createV2Callable = <T>(
  handler: (data: T, context: CallableCtx) => Promise<any> | any,
  options?: CallableOptions
) => onCall<T>(options ?? {}, (request: CallableRequest<T>) => handler(request.data, adaptCallableContext(request)));

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

const CLINIC_SHARE_CODES_COLLECTION = 'clinicShareCodes';
const CLINIC_SLUGS_COLLECTION = 'clinicSlugs';
const SHARE_CODE_CACHE_TTL_MS = 5 * 60 * 1000;
const CLINIC_SLUG_CACHE_TTL_MS = 5 * 60 * 1000;

type ClinicShareCodeDoc = {
  clinicId?: string;
  canonicalClinicId?: string;
  status?: string;
  disabled?: boolean;
};

type ClinicSlugDoc = {
  clinicId?: string;
  canonicalClinicId?: string;
  status?: string;
  disabled?: boolean;
  displayName?: string;
};

type ClinicIdentifierResolution = {
  clinicId: string;
  shareCode?: string | null;
  requestedId: string;
  resolution: 'canonical' | 'share-code' | 'slug';
};

type ShareCodeCacheEntry = {
  promise: Promise<ClinicIdentifierResolution | null>;
  expiresAt: number;
};

const clinicShareCodeCache = new Map<string, ShareCodeCacheEntry>();
const clinicSlugCache = new Map<string, ShareCodeCacheEntry>();

const SHARE_CODE_GENERATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARE_CODE_GROUP_LENGTH = 4;
const SHARE_CODE_GROUP_COUNT = 2;
const SHARE_CODE_MAX_ATTEMPTS = 20;

const isShareCodeDocActive = (doc: ClinicShareCodeDoc | undefined | null): boolean => {
  if (!doc) {
    return false;
  }
  const status = typeof doc.status === 'string' ? doc.status.toLowerCase() : 'active';
  const disabled = doc.disabled === true;
  return !disabled && status !== 'disabled' && status !== 'revoked';
};

const generateClinicShareCodeCandidate = (): string => {
  const requiredChars = SHARE_CODE_GROUP_LENGTH * SHARE_CODE_GROUP_COUNT;
  const random = crypto.randomBytes(requiredChars);
  let raw = '';
  for (let i = 0; i < requiredChars; i += 1) {
    const index = random[i] % SHARE_CODE_GENERATION_ALPHABET.length;
    raw += SHARE_CODE_GENERATION_ALPHABET[index];
  }
  const groups: string[] = [];
  for (let groupIndex = 0; groupIndex < SHARE_CODE_GROUP_COUNT; groupIndex += 1) {
    const start = groupIndex * SHARE_CODE_GROUP_LENGTH;
    groups.push(raw.slice(start, start + SHARE_CODE_GROUP_LENGTH));
  }
  return groups.join('-');
};

const isAlreadyExistsError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (code === 6 || code === 'already-exists') {
    return true;
  }
  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? '');
  return /\balready exists\b/i.test(message);
};

const ensureClinicShareCode = async (clinicId: string): Promise<string> => {
  const db = admin.firestore();
  const shareCodes = db.collection(CLINIC_SHARE_CODES_COLLECTION);

  const canonicalSnap = await shareCodes.where('canonicalClinicId', '==', clinicId).limit(10).get();
  const canonicalDoc = canonicalSnap.docs.find((docSnap) => isShareCodeDocActive(docSnap.data()));
  if (canonicalDoc) {
    const shareCode = canonicalDoc.id;
    clinicShareCodeCache.set(shareCode, {
      promise: Promise.resolve({
        clinicId,
        shareCode,
        requestedId: shareCode,
        resolution: 'share-code' as const
      }),
      expiresAt: Date.now() + SHARE_CODE_CACHE_TTL_MS
    });
    return shareCode;
  }

  const legacySnap = await shareCodes.where('clinicId', '==', clinicId).limit(10).get();
  const legacyDoc = legacySnap.docs.find((docSnap) => isShareCodeDocActive(docSnap.data()));
  if (legacyDoc) {
    const legacyRef = shareCodes.doc(legacyDoc.id);
    await legacyRef.set(
      {
        canonicalClinicId: clinicId,
        disabled: false,
        status: 'active',
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    const shareCode = legacyDoc.id;
    clinicShareCodeCache.set(shareCode, {
      promise: Promise.resolve({
        clinicId,
        shareCode,
        requestedId: shareCode,
        resolution: 'share-code' as const
      }),
      expiresAt: Date.now() + SHARE_CODE_CACHE_TTL_MS
    });
    return shareCode;
  }

  for (let attempt = 0; attempt < SHARE_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateClinicShareCodeCandidate();
    const docRef = shareCodes.doc(candidate);

    try {
      await docRef.create({
        clinicId,
        canonicalClinicId: clinicId,
        status: 'active',
        disabled: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        issuedAt: FieldValue.serverTimestamp(),
        issuedBy: 'bootstrapClinicAccount'
      });

      clinicShareCodeCache.set(candidate, {
        promise: Promise.resolve({
          clinicId,
          shareCode: candidate,
          requestedId: candidate,
          resolution: 'share-code' as const
        }),
        expiresAt: Date.now() + SHARE_CODE_CACHE_TTL_MS
      });

      return candidate;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        continue;
      }

      functions.logger.error('Failed to allocate clinic share code', {
        clinicId,
        attempt,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error
      });

      throw new functions.https.HttpsError('internal', 'Failed to allocate clinic share code');
    }
  }

  throw new functions.https.HttpsError('resource-exhausted', 'Unable to allocate a clinic share code');
};

const CLINIC_SLUG_REGEX = /^[a-z0-9-_.~]{3,128}$/;
const CLINIC_SLUG_MAX_ATTEMPTS = 30;

const slugifyFirestoreId = (label: string, fallbackPrefix: string): string => {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const candidate = normalized.length > 0 ? normalized : `${fallbackPrefix}-${crypto.randomBytes(2).toString('hex')}`;
  const sanitized = sanitizeFirestoreId(candidate);
  if (sanitized) {
    return sanitized;
  }
  return `${fallbackPrefix}-${crypto.randomBytes(3).toString('hex')}`;
};

const sanitizeClinicSlug = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9-_.~]+/g, '');
  if (!cleaned || cleaned.length < 3 || cleaned.length > 128) {
    return null;
  }
  return CLINIC_SLUG_REGEX.test(cleaned) ? cleaned : null;
};

const slugifyClinicName = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const primary = sanitizeClinicSlug(normalized);
  if (primary) {
    return primary;
  }

  const fallbackBase = `clinic-${crypto.randomBytes(2).toString('hex')}`;
  return sanitizeClinicSlug(fallbackBase) ?? `clinic-${Date.now().toString(36)}`.slice(0, 24);
};

const loadClinicBySlug = (slug: string): Promise<ClinicIdentifierResolution | null> => {
  const normalized = sanitizeClinicSlug(slug);
  if (!normalized) {
    return Promise.resolve(null);
  }
  const cached = clinicSlugCache.get(normalized);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = (async () => {
    const doc = await admin.firestore().collection(CLINIC_SLUGS_COLLECTION).doc(normalized).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as ClinicSlugDoc | undefined;
    const candidateId = sanitizeFirestoreId(
      typeof data?.canonicalClinicId === 'string' ? data.canonicalClinicId : data?.clinicId
    );

    if (!candidateId) {
      functions.logger.error('Clinic slug record missing valid clinicId', {
        slug: normalized,
        data: data ?? null
      });
      return null;
    }

    const status = typeof data?.status === 'string' ? data.status.toLowerCase() : 'active';
    const disabled = data?.disabled === true;

    if (disabled || status === 'disabled' || status === 'revoked') {
      throw new functions.https.HttpsError('failed-precondition', 'Clinic link is inactive.');
    }

    return {
      clinicId: candidateId,
      shareCode: null,
      requestedId: normalized,
      resolution: 'slug' as const
    } satisfies ClinicIdentifierResolution;
  })().catch((error) => {
    clinicSlugCache.delete(normalized);
    throw error;
  });

  clinicSlugCache.set(normalized, {
    promise,
    expiresAt: now + CLINIC_SLUG_CACHE_TTL_MS
  });

  return promise;
};

const ensureClinicSlug = async (clinicId: string, clinicName: string): Promise<string> => {
  const db = admin.firestore();
  const slugCollection = db.collection(CLINIC_SLUGS_COLLECTION);
  const baseSlug = slugifyClinicName(clinicName);
  const fallbackSlug = sanitizeClinicSlug(`clinic-${clinicId.slice(0, 6).toLowerCase()}`) ?? baseSlug;

  for (let attempt = 0; attempt < CLINIC_SLUG_MAX_ATTEMPTS; attempt += 1) {
    const candidateBase = attempt === 0 ? baseSlug : fallbackSlug;
    const suffix = attempt === 0 ? '' : `-${crypto.randomBytes(2).toString('hex')}`;
    const rawCandidate = `${candidateBase}${suffix}`.slice(0, 64);
    const candidate = sanitizeClinicSlug(rawCandidate);
    if (!candidate) {
      continue;
    }

    try {
      const result = await db.runTransaction(async (tx) => {
        const ref = slugCollection.doc(candidate);
        const snap = await tx.get(ref);
        if (!snap.exists) {
          tx.set(ref, {
            clinicId,
            canonicalClinicId: clinicId,
            status: 'active',
            disabled: false,
            displayName: clinicName,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
          return candidate;
        }

        const existing = snap.data() as ClinicSlugDoc | undefined;
        const existingId = sanitizeFirestoreId(
          typeof existing?.canonicalClinicId === 'string' ? existing.canonicalClinicId : existing?.clinicId
        );

        if (existingId === clinicId) {
          tx.set(
            ref,
            {
              canonicalClinicId: clinicId,
              disabled: false,
              status: 'active',
              displayName: clinicName,
              updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
          return candidate;
        }

        return null;
      });

      if (result) {
        clinicSlugCache.set(result, {
          promise: Promise.resolve({
            clinicId,
            shareCode: null,
            requestedId: result,
            resolution: 'slug' as const
          }),
          expiresAt: Date.now() + CLINIC_SLUG_CACHE_TTL_MS
        });
        return result;
      }
    } catch (error) {
      functions.logger.error('Failed to assign clinic slug', {
        clinicId,
        attempt,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error
      });
      throw error instanceof functions.https.HttpsError
        ? error
        : new functions.https.HttpsError('internal', 'Failed to allocate clinic slug');
    }
  }

  throw new functions.https.HttpsError('resource-exhausted', 'Unable to allocate a clinic slug');
};

const normalizeClinicShareCode = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const compact = trimmed.replace(/\s+/g, '');
  const alphanumeric = compact.replace(/-/g, '');
  const normalized = alphanumeric.toUpperCase();
  if (normalized.length !== 8 || /[^A-Z0-9]/.test(normalized)) {
    return null;
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
};

const loadClinicByShareCode = (shareCode: string): Promise<ClinicIdentifierResolution | null> => {
  const existing = clinicShareCodeCache.get(shareCode);
  const now = Date.now();
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }

  const promise = (async () => {
    const snapshot = await admin.firestore()
      .collection(CLINIC_SHARE_CODES_COLLECTION)
      .doc(shareCode)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as ClinicShareCodeDoc | undefined;
    const candidateId =
      typeof data?.canonicalClinicId === 'string' ? data.canonicalClinicId :
      typeof data?.clinicId === 'string' ? data.clinicId :
      null;

    const sanitizedClinicId = sanitizeFirestoreId(candidateId);
    if (!sanitizedClinicId) {
      functions.logger.error('Share code record missing valid clinicId', {
        shareCode,
        data: data ?? null
      });
      return null;
    }

    const status = typeof data?.status === 'string' ? data.status.toLowerCase() : 'active';
    const disabled = data?.disabled === true;

    if (disabled || ['revoked', 'disabled'].includes(status)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Clinic code is inactive. Please contact the clinic for a new code.'
      );
    }

    return {
      clinicId: sanitizedClinicId,
      shareCode,
      resolution: 'share-code' as const,
      requestedId: shareCode
    } satisfies ClinicIdentifierResolution;
  })().catch((error) => {
    clinicShareCodeCache.delete(shareCode);
    throw error;
  });

  clinicShareCodeCache.set(shareCode, {
    promise,
    expiresAt: now + SHARE_CODE_CACHE_TTL_MS
  });

  return promise;
};

type ResolveClinicIdentifierOptions = {
  fieldName?: string;
  allowShareCodeLookup?: boolean;
};

const resolveClinicIdentifier = async (
  value: unknown,
  options: ResolveClinicIdentifierOptions = {}
): Promise<ClinicIdentifierResolution> => {
  const fieldName = options.fieldName ?? 'clinicId';
  const requestedId = typeof value === 'string' ? value.trim() : '';

  if (!requestedId) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} is required`);
  }

  const shareCodeNormalized =
    options.allowShareCodeLookup === false ? null : normalizeClinicShareCode(requestedId);

  if (shareCodeNormalized) {
    try {
      const resolved = await loadClinicByShareCode(shareCodeNormalized);
      if (resolved) {
        if (shareCodeNormalized !== requestedId.toUpperCase()) {
          functions.logger.debug('Clinic share code normalized', {
            requestedId,
            shareCodeNormalized,
            clinicId: resolved.clinicId
          });
        }
        return { ...resolved, requestedId } satisfies ClinicIdentifierResolution;
      }
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error('Share code lookup failed', {
        requestedId,
        shareCodeNormalized,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
      });
      throw new functions.https.HttpsError('internal', 'Failed to resolve clinic code');
    }

    throw new functions.https.HttpsError('not-found', 'Clinic code not recognized');
  }

  const slugCandidate = sanitizeClinicSlug(requestedId);
  if (slugCandidate) {
    try {
      const resolved = await loadClinicBySlug(slugCandidate);
      if (resolved) {
        if (slugCandidate !== requestedId) {
          functions.logger.debug('Clinic resolved via slug', {
            requestedId,
            slug: slugCandidate,
            clinicId: resolved.clinicId
          });
        }
        return { ...resolved, requestedId } satisfies ClinicIdentifierResolution;
      }
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error('Clinic slug lookup failed', {
        requestedId,
        slug: slugCandidate,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
      });
      throw new functions.https.HttpsError('internal', 'Failed to resolve clinic identifier');
    }
  }

  const sanitized = sanitizeFirestoreId(requestedId);
  if (!sanitized) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} is invalid`);
  }

  if (slugCandidate) {
    try {
      const clinicSnap = await admin.firestore().collection('clinics').doc(sanitized).get();
      if (!clinicSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Clinic identifier not recognized');
      }
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error('Clinic canonical lookup failed during slug resolution', {
        requestedId,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
      });
      throw new functions.https.HttpsError('internal', 'Failed to validate clinic identifier');
    }
  }

  return {
    clinicId: sanitized,
    resolution: 'canonical',
    shareCode: null,
    requestedId
  } satisfies ClinicIdentifierResolution;
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

type UserAccess = {
  primaryClinicId: string | null;
  primaryDoctorId: string | null;
  additionalClinicIds: string[];
  doctorAssignments: Record<string, string[]>;
  roles: string[];
};

type UserAccessCacheEntry = {
  promise: Promise<UserAccess>;
  resolvedValue?: UserAccess;
  timestamp: number;
};

const USER_ACCESS_CACHE_TTL_MS = 0;

const userAccessCache = new Map<string, UserAccessCacheEntry>();

const isCacheEntryFresh = (entry: UserAccessCacheEntry, now: number): boolean => {
  return now - entry.timestamp < USER_ACCESS_CACHE_TTL_MS;
};

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

const toDoctorAssignments = (value: unknown): Record<string, string[]> => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [key, rawList] of Object.entries(value)) {
    const clinicId = String(key).trim();
    if (!clinicId) {
      continue;
    }
    const doctorIds = toStringArray(rawList);
    if (doctorIds.length > 0) {
      result[clinicId] = doctorIds;
    }
  }
  return result;
};

const mergeUniqueIds = (...lists: string[][]): string[] => {
  const set = new Set<string>();
  for (const list of lists) {
    for (const entry of list) {
      if (entry) {
        set.add(entry);
      }
    }
  }
  return Array.from(set);
};

const loadUserAccess = async (uid: string): Promise<UserAccess> => {
  const now = Date.now();
  const cached = userAccessCache.get(uid);
  if (cached) {
    if (cached.resolvedValue && isCacheEntryFresh(cached, now)) {
      return cached.resolvedValue;
    }
    if (!cached.resolvedValue) {
      return cached.promise;
    }

    userAccessCache.delete(uid);
  }

  const cacheEntry: UserAccessCacheEntry = {
    promise: Promise.resolve(null as unknown as UserAccess),
    timestamp: now
  };

  const promise = (async (): Promise<UserAccess> => {
    try {
      const snap = await admin.firestore().collection('users').doc(uid).get();
      const data = (snap.exists ? snap.data() : undefined) || {};
      const primaryClinicId = toTrimmedString((data as Record<string, unknown>)['clinicId']);
      const primaryDoctorId = toTrimmedString((data as Record<string, unknown>)['doctorId']);

      const additionalClinicIds = mergeUniqueIds(
        toStringArray((data as Record<string, unknown>)['clinicIds']),
        toStringArray((data as Record<string, unknown>)['staffClinicIds']),
        toStringArray((data as Record<string, unknown>)['managedClinics']),
        toStringArray((data as Record<string, unknown>)['additionalClinicIds'])
      );

      const doctorAssignmentsRaw = {
        ...(typeof (data as Record<string, unknown>)['doctorAssignments'] === 'object'
          ? ((data as Record<string, unknown>)['doctorAssignments'] as Record<string, unknown>)
          : {}),
        ...(typeof (data as Record<string, unknown>)['staffDoctorIds'] === 'object'
          ? ((data as Record<string, unknown>)['staffDoctorIds'] as Record<string, unknown>)
          : {})
      };

      const doctorAssignments = toDoctorAssignments(doctorAssignmentsRaw);

      const roles = mergeUniqueIds(toStringArray((data as Record<string, unknown>)['roles']));

      const access: UserAccess = {
        primaryClinicId,
        primaryDoctorId,
        additionalClinicIds,
        doctorAssignments,
        roles
      };

      cacheEntry.resolvedValue = access;
      cacheEntry.timestamp = Date.now();

      return access;
    } catch (error) {
      if (userAccessCache.get(uid) === cacheEntry) {
        userAccessCache.delete(uid);
      }
      throw error;
    }
  })();

  cacheEntry.promise = promise;
  userAccessCache.set(uid, cacheEntry);

  return promise;
};

const collectClinicIds = (access: UserAccess): Set<string> => {
  const ids = new Set<string>();
  if (access.primaryClinicId) {
    ids.add(access.primaryClinicId);
  }
  for (const value of access.additionalClinicIds) {
    ids.add(value);
  }
  for (const clinicId of Object.keys(access.doctorAssignments)) {
    ids.add(clinicId);
  }
  return ids;
};

const hasClinicAccess = (access: UserAccess, clinicId: string): boolean => {
  if (!clinicId) {
    return false;
  }
  return collectClinicIds(access).has(clinicId);
};

const hasDoctorAccess = (access: UserAccess, clinicId: string, doctorId: string): boolean => {
  if (!clinicId || !doctorId) {
    return false;
  }
  if (access.primaryClinicId === clinicId && access.primaryDoctorId === doctorId) {
    return true;
  }
  const assignments = access.doctorAssignments[clinicId] || [];
  if (assignments.includes(doctorId)) {
    return true;
  }
  return false;
};

const isPatientAuthContext = (auth: CallableCtx['auth']): boolean => {
  return Boolean(auth?.token && (auth.token as Record<string, unknown>)?.['patient'] === true);
};

const isSyntheticPatientUid = (uid: string | undefined | null): boolean => {
  if (typeof uid !== 'string') {
    return false;
  }
  return uid.startsWith('patient-self:') || uid.startsWith('patient_');
};

const ensurePatientAuthMatches = (
  auth: NonNullable<CallableCtx['auth']>,
  clinicId: string,
  doctorId: string,
  queueId?: string | null,
  patientId?: string | null
) => {
  const token = auth.token as Record<string, unknown>;
  if (token?.['patientClinicId'] !== clinicId) {
    throw new functions.https.HttpsError('permission-denied', 'Patient token does not match clinic');
  }
  if (token?.['patientDoctorId'] !== doctorId) {
    throw new functions.https.HttpsError('permission-denied', 'Patient token does not match doctor');
  }
  if (queueId && token?.['patientQueueId'] !== queueId) {
    throw new functions.https.HttpsError('permission-denied', 'Patient token does not match queue');
  }
  if (patientId && token?.['patientId'] !== patientId) {
    throw new functions.https.HttpsError('permission-denied', 'Patient token does not match patient');
  }
};

interface EnsureStaffAccessOptions {
  clinicId: string;
  doctorId?: string;
  action: string;
  allowClinicAdminWithoutDoctor?: boolean;
}

const ensureStaffAccess = async (
  context: CallableCtx,
  options: EnsureStaffAccessOptions
): Promise<void> => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (isPatientAuthContext(context.auth)) {
    throw new functions.https.HttpsError('permission-denied', 'Patient session cannot perform this action');
  }

  const access = await loadUserAccess(context.auth.uid);
  if (!hasClinicAccess(access, options.clinicId)) {
    throw new functions.https.HttpsError('permission-denied', `Not authorized to ${options.action}`);
  }
  if (options.doctorId) {
    const doctorAllowed =
      hasDoctorAccess(access, options.clinicId, options.doctorId) ||
      (options.allowClinicAdminWithoutDoctor === true && access.roles.includes('clinic-admin'));
    if (!doctorAllowed) {
      throw new functions.https.HttpsError('permission-denied', `Not authorized to ${options.action} for this doctor`);
    }
  }
};

const debugEndpointsEnabled = () => {
  return process.env.ENABLE_DEBUG_ENDPOINTS === 'true' || process.env.FUNCTIONS_EMULATOR === 'true';
};

const ensureDebugAccess = async (
  context: CallableCtx,
  options: EnsureStaffAccessOptions | null,
  requireAuth = true
) => {
  if (!debugEndpointsEnabled()) {
    throw new functions.https.HttpsError('permission-denied', 'Debug endpoint disabled');
  }
  if (requireAuth && !context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (options) {
    await ensureStaffAccess(context, options);
  }
};

const hashAccessToken = (token: string) => crypto.createHash('sha256').update(String(token)).digest('hex');

const anonymizeIdentifier = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  try {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  } catch (error) {
    functions.logger.warn('Failed to anonymize identifier', {
      valueLength: value.length,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};

type JoinQueueRequest = {
  clinicId?: string;
  doctorId?: string;
  patientData?: {
    name?: string;
    age?: number;
    phone?: string;
  };
};

type PatientResolverSummary = {
  version: string;
  matchType: string;
  confidence: string;
  requiresReview: boolean;
  metadataVersion: number;
  ambiguityId?: string | null;
} | null;

type JoinQueueResponse = {
  success: boolean;
  message: string;
  patientId: string;
  queueId: string;
  doctorId: string;
  clinicId: string;
  accessToken: string;
  patientIdentityId?: string;
  patientResolver?: PatientResolverSummary;
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
  patientIdentityId?: string;
  patientResolver?: PatientResolverSummary;
  requiresPatientReview?: boolean;
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

type CreatePatientSessionRequest = {
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  patientId?: string;
  token?: string;
};

type CreatePatientSessionResponse = {
  success: boolean;
  token: string;
  patient?: Record<string, unknown> | null;
};

/** DEBUG: Returns runtime flag visibility and Node version */
const debugRuntimeFlagsHandler = async (_data: unknown, _ctx: CallableCtx) => {
  await ensureDebugAccess(_ctx, null, false);
  let resolverFlag: PatientResolverFlagSnapshot | null = null;
  try {
    resolverFlag = await currentPatientResolverFlagSnapshot({ forceReload: true });
  } catch (error) {
    functions.logger.warn('debugRuntimeFlags failed to load resolver flag snapshot', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return {
    phase1Enabled: true,
    rawPhase1: 'hardcoded:true',
    engineEnabled: true,
    rawEngine: 'hardcoded:true',
    node: process.version,
    resolverFlag
  };
};
export const debugRuntimeFlags = createV2Callable(debugRuntimeFlagsHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });

/** DEBUG: Show resolved Patient PWA base URL */
const debugPatientPwaBaseUrlHandler = async (_data: unknown, _ctx: CallableCtx) => {
  await ensureDebugAccess(_ctx, null, false);
  try {
    const envValRaw = process.env.PATIENT_PWA_BASE_URL;
    const envVal = envValRaw && envValRaw.trim().length > 0 ? envValRaw.trim() : null;
    const resolved = envVal;
    return { env: !!envVal, envVal, resolved };
  } catch (e:any) {
    return { error: e?.message || String(e) };
  }
};
export const debugPatientPwaBaseUrl = createV2Callable(debugPatientPwaBaseUrlHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });

/** DEBUG: Force recompute for a queue (engine default-on). data: { clinicId, doctorId, queueId } */
const debugRecomputeHandler = async (data: any, _ctx: CallableCtx) => {
  const { clinicId, doctorId, queueId } = data || {};
  if (!clinicId || !doctorId || !queueId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId required');
  }

  await ensureDebugAccess(_ctx, {
    clinicId,
    doctorId,
    action: 'debug recompute queue'
  });

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
export const debugRecompute = createV2Callable(debugRecomputeHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });

/** DEBUG: Fetch patient doc raw (no auth). data: { clinicId, doctorId, queueId, patientId } */
const debugGetPatientHandler = async (data: any, _ctx: CallableCtx) => {
  const { clinicId, doctorId, queueId, patientId } = data || {};
  if (!clinicId || !doctorId || !queueId || !patientId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId, patientId required');
  }

  await ensureDebugAccess(_ctx, {
    clinicId,
    doctorId,
    action: 'debug get patient'
  });

  const snap = await admin.firestore().collection('clinics').doc(clinicId)
    .collection('doctors').doc(doctorId)
    .collection('queues').doc(queueId)
    .collection('patients').doc(patientId).get();
  if (!snap.exists) return { found: false };
  return { found: true, data: snap.data() };
};
export const debugGetPatient = createV2Callable(debugGetPatientHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });

// NOTE: Staff privilege checks are enforced via ensureStaffAccess for protected operations.

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

// Removed redundant v1 Firestore triggers:
// - onNewPatient: monitored non-existent top-level 'patients/' collection (patients are nested under queues)
// - onPatientStatusChange: permanently suppressed, replaced by notificationEngine in updatePatientStatus

/**
 * Callable Cloud Function to add a patient to a queue.
 * This is invoked from the client SDK and handles auth and data serialization.
 * Implements secure queue joining with automatic token assignment.
 */
const joinQueueHandler = async (data: JoinQueueRequest, _context: CallableCtx): Promise<JoinQueueResponse> => {
  const span = startTiming('joinQueue', {
    clinicId: data?.clinicId ?? null,
    doctorId: data?.doctorId ?? null
  });
  let spanClosed = false;
  try {
    // Extract data from the 'data' parameter provided by the client SDK
    const rawClinicId = data?.clinicId;
    const rawDoctorId = data?.doctorId;
    const patientData = data?.patientData;

    // Validate required fields
    if (!rawClinicId || !rawDoctorId || !patientData) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: clinicId, doctorId, and patientData are required.'
      );
    }

  const clinicResolution = await resolveClinicIdentifier(rawClinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(rawDoctorId);

    if (!doctorId) {
      throw new functions.https.HttpsError('invalid-argument', 'doctorId is invalid');
    }

    if (clinicResolution.shareCode) {
      functions.logger.debug('joinQueue clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode
      });
    }

    let normalizedPatient;
    try {
      normalizedPatient = sanitizePatientInput(patientData, { requirePhone: true });
    } catch (error) {
      const message = error instanceof PatientValidationError ? error.message : 'Invalid patient data';
      throw new functions.https.HttpsError('invalid-argument', message);
    }

    const normalizedName = normalizedPatient.name;
    const ageValue = normalizedPatient.age;
    const phoneValue = normalizedPatient.phone;

    if (ageValue == null) {
      throw new functions.https.HttpsError('invalid-argument', 'Patient age is required');
    }

    if (!phoneValue) {
      throw new functions.https.HttpsError('invalid-argument', 'Patient phone is required');
    }

    const normalizedAge = ageValue;
    const normalizedPhone = phoneValue;
    const normalizedFullName = normalizePatientFullName(normalizedName);

    const resolverMetadata: PatientMetadataInput = {};
    if (typeof normalizedAge === 'number') {
      resolverMetadata.age = normalizedAge;
    }

    const resolverEnabled = await isPatientResolverV1Enabled({ allowDryRun: true });
    let patientResolverResult: PatientResolverResult | null = null;
    let patientIdentityLink: QueuePatientLink | null = null;
    let patientResolverSummary: PatientResolverSummary = null;

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
          cancelledPatients: 0,
          waitingPatients: 1,
          inProgressPatients: 0,
          createdAt: FieldValue.serverTimestamp(),
          metrics: {
            totalServiceMs: 0,
            serviceSamples: 0,
            totalWaitMs: 0,
            waitSamples: 0,
            avgServiceMs: null,
            avgWaitMs: null,
            updatedAt: FieldValue.serverTimestamp()
          }
        };
        transaction.set(queueRef, newQueueData);
      } else {
        const queueData = queueDoc.data();
        newTokenNumber = (queueData?.totalPatients || 0) + 1;
        transaction.update(queueRef, {
          totalPatients: newTokenNumber,
          waitingPatients: FieldValue.increment(1)
        });
      }

      rawAccessToken = crypto.randomBytes(32).toString('hex');
      const accessTokenHash = crypto.createHash('sha256').update(rawAccessToken).digest('hex');

      newPatientData = {
        id: '', // Will be set after document creation
        name: normalizedName,
        age: normalizedAge,
        phone: normalizedPhone,
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

    const patientDocRef = patientsRef.doc(newPatientData.id);

    // Send "joined" notification without blocking the response path
    runInBackground('joinQueue.sendJoinedNotification', async () => {
      try {
        const canSendJoined = await isNotificationEnabled({
          clinicId,
          channel: 'whatsapp',
          event: 'tokenUpdates'
        });

        if (!canSendJoined) {
          functions.logger.info('Skipping joined notification because clinic disabled token updates', {
            clinicId,
            doctorId,
            queueId: today,
            patientId: newPatientData.id
          });
          return;
        }

        // Mark the patient's notifications.joined flag (so emulator/debug shows it)
        try {
          await patientDocRef.set({ notifications: { joined: true } }, { merge: true });
        } catch (e) {
          functions.logger.warn('Failed to mark joined notification on patient doc', e);
        }

        await sendNotification({
          to: normalizedPhone,
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
        functions.logger.warn('Failed to send joined notification (background):', notifyErr);
      }
    });

    if (resolverEnabled) {
      try {
        patientResolverResult = await resolvePatientForQueue({
          actor: {
            actorType: 'system',
            actorId: 'callable:joinQueue',
            actorClinicId: clinicId
          },
          context: {
            clinicId,
            doctorId,
            queueId: today,
            queueDate: today
          },
          patient: {
            name: normalizedName,
            normalizedName: normalizedFullName,
            age: normalizedAge,
            phone: {
              normalized: normalizedPhone
            },
            metadata: Object.keys(resolverMetadata).length > 0 ? resolverMetadata : undefined
          },
          allowCreate: true
        });

        patientIdentityLink = buildQueuePatientLink(patientResolverResult);
        patientResolverSummary = {
          version: patientResolverResult.resolverVersion,
          matchType: patientResolverResult.matchType,
          confidence: patientResolverResult.confidence,
          requiresReview: patientResolverResult.requiresReview,
          metadataVersion: patientResolverResult.metadataVersion,
          ambiguityId: patientResolverResult.ambiguityEntryRef?.id ?? null
        };

        const resolverUpdate: Record<string, unknown> = {
          patientIdentityId: patientResolverResult.patientId,
          patientIdentityLink,
          patientResolver: patientResolverSummary,
          requiresPatientReview: patientResolverResult.requiresReview === true
        };

        persistResolverDataAsync(patientDocRef, resolverUpdate, {
          clinicId,
          doctorId,
          queueId: today,
          patientId: newPatientData.id,
          source: 'joinQueue'
        });

        functions.logger.info('joinQueue resolved patient identity', {
          clinicId,
          doctorId,
          queueId: today,
          patientDocId: newPatientData.id,
          patientIdentityId: patientResolverResult.patientId,
          matchType: patientResolverResult.matchType,
          requiresReview: patientResolverResult.requiresReview,
          persistedAsync: true
        });
      } catch (resolverError) {
        functions.logger.error('joinQueue patient resolver failed', {
          clinicId,
          doctorId,
          queueId: today,
          patientDocId: newPatientData.id,
          error: resolverError instanceof Error ? resolverError.message : String(resolverError),
          stack: resolverError instanceof Error ? resolverError.stack : undefined
        });
      }
    }

    const response: JoinQueueResponse = {
      success: true,
      message: 'Successfully joined the queue',
      patientId: newPatientData.id,
      queueId: today,
      doctorId: doctorId,
      clinicId: clinicId,
      accessToken: rawAccessToken,
      ...(patientResolverResult
        ? {
            patientIdentityId: patientResolverResult.patientId,
            patientResolver: patientResolverSummary
          }
        : {})
    };

    span.succeed({ patientId: newPatientData.id, queueId: today });
    spanClosed = true;

    // Return data to the client
    return response;

  } catch (error) {
    functions.logger.error('Error in joinQueue function:', error);
    if (!spanClosed) {
      span.fail({ error: error instanceof Error ? error.message : String(error) });
      spanClosed = true;
    }
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

export const joinQueue = createV2Callable(joinQueueHandler, { memory: criticalMemory, cpu: criticalCpu });

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

    const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(data?.doctorId);
    const queueId = sanitizeFirestoreId(data?.queueId);

    if (clinicResolution.shareCode) {
      functions.logger.debug('manualAddPatient clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode,
        uid
      });
    }

    if (!doctorId || !queueId) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, and queueId are required');
    }

    await ensureStaffAccess(context, {
      clinicId,
      doctorId,
      action: 'manually add patient'
    });

    const patientInput = data?.patient ?? {};
    let sanitizedPatient: { name: string; age: number | null; phone: string | null };
    try {
      sanitizedPatient = sanitizePatientInput(patientInput, { requirePhone: false, requireAge: false });
    } catch (error) {
      if (error instanceof PatientValidationError) {
        span.fail({ reason: error.code });
        throw new functions.https.HttpsError('invalid-argument', error.message);
      }
      span.fail({
        reason: 'invalid-patient',
        message: error instanceof Error ? error.message : String(error)
      });
      throw new functions.https.HttpsError('invalid-argument', 'Invalid patient data');
    }

    const rawName = sanitizedPatient.name;
    const age = sanitizedPatient.age;
    let phone: string | null = sanitizedPatient.phone;

    const suppressNotification = data?.suppressNotification === true;

    const normalizedFullName = normalizePatientFullName(rawName);
    const resolverMetadata: PatientMetadataInput = {};
    if (typeof age === 'number') {
      resolverMetadata.age = age;
    }
    const resolverEnabled = await isPatientResolverV1Enabled({ allowDryRun: true, allowPilot: true });
    let patientResolverResult: PatientResolverResult | null = null;
    let patientIdentityLink: QueuePatientLink | null = null;
    let patientResolverSummary: PatientResolverSummary = null;

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
      runInBackground('manualAddPatient.sendJoinedNotification', async () => {
        try {
          const canSendJoined = await isNotificationEnabled({
            clinicId,
            channel: 'whatsapp',
            event: 'tokenUpdates'
          });

          if (!canSendJoined) {
            functions.logger.info('Skipping manual joined notification because clinic disabled token updates', {
              clinicId,
              doctorId,
              queueId,
              patientId: newPatientId
            });
            return;
          }

          try {
            await patientDocRef.set({ notifications: { joined: true } }, { merge: true });
          } catch (flagErr) {
            functions.logger.warn('Failed to mark manual joined notification flag', flagErr, {
              clinicId,
              doctorId,
              queueId,
              patientId: newPatientId
            });
          }

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
          functions.logger.warn('Failed to send manual joined notification (background)', notifyErr, {
            clinicId,
            doctorId,
            queueId,
            patientId: newPatientId
          });
        }
      });
    } else if (suppressNotification) {
      runInBackground('manualAddPatient.recordJoinedSuppression', async () => {
        try {
          await patientDocRef.set({ notifications: { joinedSuppressed: true } }, { merge: true });
        } catch (notifyFlagErr) {
          functions.logger.warn('Failed to record notification suppression flag', notifyFlagErr, {
            clinicId,
            doctorId,
            queueId,
            patientId: newPatientId
          });
        }
      });
    }

    if (resolverEnabled) {
      try {
        const resolverPhone = phone ?? null;
        patientResolverResult = await resolvePatientForQueue({
          actor: {
            actorType: 'user',
            actorId: uid,
            actorClinicId: clinicId
          },
          context: {
            clinicId,
            doctorId,
            queueId,
            queueDate: queueId
          },
          patient: {
            name: rawName,
            normalizedName: normalizedFullName,
            age: age ?? undefined,
            phone: resolverPhone ? { normalized: resolverPhone } : null,
            metadata: Object.keys(resolverMetadata).length > 0 ? resolverMetadata : undefined
          },
          allowCreate: true
        });

        patientIdentityLink = buildQueuePatientLink(patientResolverResult);
        patientResolverSummary = {
          version: patientResolverResult.resolverVersion,
          matchType: patientResolverResult.matchType,
          confidence: patientResolverResult.confidence,
          requiresReview: patientResolverResult.requiresReview,
          metadataVersion: patientResolverResult.metadataVersion,
          ambiguityId: patientResolverResult.ambiguityEntryRef?.id ?? null
        };

        const resolverUpdate: Record<string, unknown> = {
          patientIdentityId: patientResolverResult.patientId,
          patientIdentityLink,
          patientResolver: patientResolverSummary,
          requiresPatientReview: patientResolverResult.requiresReview === true
        };

        persistResolverDataAsync(patientDocRef, resolverUpdate, {
          clinicId,
          doctorId,
          queueId,
          patientId: newPatientId,
          source: 'manualAddPatient'
        });

        functions.logger.info('manualAddPatient resolved patient identity', {
          clinicId,
          doctorId,
          queueId,
          patientDocId: newPatientId,
          patientIdentityId: patientResolverResult.patientId,
          matchType: patientResolverResult.matchType,
          requiresReview: patientResolverResult.requiresReview,
          persistedAsync: true
        });
      } catch (resolverError) {
        functions.logger.error('manualAddPatient resolver failed', {
          clinicId,
          doctorId,
          queueId,
          patientDocId: newPatientId,
          error: resolverError instanceof Error ? resolverError.message : String(resolverError)
        });
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
      uid,
      ...(patientResolverResult
        ? {
            patientIdentityId: patientResolverResult.patientId,
            patientResolverMatchType: patientResolverResult.matchType,
            patientResolverRequiresReview: patientResolverResult.requiresReview
          }
        : {})
    });

    span.succeed({ patientId: newPatientId, tokenNumber: newTokenNumber });

    return {
      success: true,
      patientId: newPatientId,
      queueId,
      doctorId,
      clinicId,
      accessToken: rawAccessToken,
      tokenNumber: newTokenNumber,
      ...(patientResolverResult
        ? {
            patientIdentityId: patientResolverResult.patientId,
            patientResolver: patientResolverSummary,
            requiresPatientReview: patientResolverResult.requiresReview === true
          }
        : {})
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

export const manualAddPatient = createV2Callable(manualAddPatientHandler, { memory: criticalMemory, cpu: criticalCpu });

/**
 * Callable Cloud Function to return a patient's view after validating a short-lived token.
 * Expected data: { clinicId, doctorId, queueId, patientId, token }
 */
const getPatientViewHandler = async (data: GetPatientViewRequest, _context: CallableCtx) => {
  try {
    const { clinicId: rawClinicId, doctorId: rawDoctorId, queueId: rawQueueId, patientId: rawPatientId, token } = data || {};

    if (!rawClinicId || !rawDoctorId || !rawQueueId || !rawPatientId || !token) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, patientId, token');
    }

  const clinicResolution = await resolveClinicIdentifier(rawClinicId, { allowShareCodeLookup: false });
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(rawDoctorId);
    const queueId = sanitizeFirestoreId(rawQueueId);
    const patientId = sanitizeFirestoreId(rawPatientId);

    if (!doctorId || !queueId || !patientId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid doctor, queue, or patient identifier');
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

const isSignBlobPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: string; errorInfo?: { code?: string; message?: string } | null; message?: string };
  const code = candidate.errorInfo?.code ?? candidate.code;
  if (code !== 'auth/insufficient-permission') {
    return false;
  }
  const message = candidate.errorInfo?.message ?? candidate.message;
  return typeof message === 'string' && message.includes('iam.serviceAccounts.signBlob');
};

const createPatientSessionHandler = async (data: CreatePatientSessionRequest, _context: CallableCtx): Promise<CreatePatientSessionResponse> => {
  const { clinicId: rawClinicId, doctorId: rawDoctorId, queueId: rawQueueId, patientId: rawPatientId, token } = data || {};
  let clinicId: string | null = null;
  let doctorId: string | null = null;
  let queueId: string | null = null;
  let patientId: string | null = null;
  try {
    if (!rawClinicId || !rawDoctorId || !rawQueueId || !rawPatientId || !token) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, patientId, token');
    }

    const clinicResolution = await resolveClinicIdentifier(rawClinicId, { allowShareCodeLookup: false });
    clinicId = clinicResolution.clinicId;
    doctorId = sanitizeFirestoreId(rawDoctorId);
    queueId = sanitizeFirestoreId(rawQueueId);
    patientId = sanitizeFirestoreId(rawPatientId);

    if (!clinicId || !doctorId || !queueId || !patientId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid doctor, queue, or patient identifier');
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

    const patientData = patientSnap.data() as Record<string, unknown> | undefined;
    const storedHash = patientData?.accessTokenHash;
    if (!storedHash) {
      throw new functions.https.HttpsError('permission-denied', 'Access token not configured for this patient');
    }

    const tokenHash = hashAccessToken(token);
    if (tokenHash !== storedHash) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid token');
    }

    if (typeof patientData?.queueId === 'string' && patientData.queueId !== queueId) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid token');
    }

    const patientUid = `patient_${tokenHash}`;
    const customToken = await admin.auth().createCustomToken(patientUid, {
      patient: true,
      patientClinicId: clinicId,
      patientDoctorId: doctorId,
      patientQueueId: queueId,
      patientId,
      patientTokenHash: tokenHash
    });

    const safePatient: Record<string, unknown> = { ...(patientData ?? {}), id: patientId };
    delete safePatient.accessTokenHash;

    return {
      success: true,
      token: customToken,
      patient: safePatient
    } satisfies CreatePatientSessionResponse;
  } catch (error) {
    if (isSignBlobPermissionError(error)) {
      functions.logger.error('createPatientSession missing iam.serviceAccounts.signBlob permission', {
        clinicId: clinicId ?? null,
        doctorId: doctorId ?? null,
        queueId: queueId ?? null,
        patientId: patientId ?? null,
        rawClinicId: rawClinicId ?? null,
        rawDoctorId: rawDoctorId ?? null,
        rawQueueId: rawQueueId ?? null,
        rawPatientId: rawPatientId ?? null,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw new functions.https.HttpsError('failed-precondition', 'Service misconfiguration detected. Please try again in a few minutes.');
    }
    functions.logger.error('Error in createPatientSession function:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Internal server error');
  }
};

export const createPatientSession = createV2Callable(createPatientSessionHandler);

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
  let autoAdvancePromoted: boolean | null = null;
  let recomputeTriggered = false;
  let phase1DurationMs: number | null = null;
  let phase1BackgroundScheduled = false;
  let autoAdvanceScheduled = false;
  let spanClosed = false;
  try {
    // Check authentication and staff claim (supports emulator users/{uid}.staff fallback)
    if (!context.auth) {
      span.fail({ reason: 'unauthenticated' });
      spanClosed = true;
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
    }

    // Extract and validate required fields
    const {
      clinicId: rawClinicId,
      doctorId: rawDoctorId,
      queueId: rawQueueId,
      patientId: rawPatientId,
      newStatus
    } = data;

    if (!rawClinicId || !rawDoctorId || !rawQueueId || !rawPatientId || !newStatus) {
      span.fail({ reason: 'invalid-argument' });
      spanClosed = true;
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: clinicId, doctorId, queueId, patientId, and newStatus are required.'
      );
    }

    const clinicResolution = await resolveClinicIdentifier(rawClinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(rawDoctorId);
    const queueId = sanitizeFirestoreId(rawQueueId);
    const patientId = sanitizeFirestoreId(rawPatientId);

    if (!doctorId || !queueId || !patientId) {
      span.fail({ reason: 'invalid-argument' });
      spanClosed = true;
      throw new functions.https.HttpsError('invalid-argument', 'Invalid doctor, queue, or patient identifier');
    }

    if (clinicResolution.shareCode) {
      functions.logger.debug('updatePatientStatus clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode,
        uid: context.auth?.uid ?? null
      });
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

    const auth = context.auth;
    const isPatientToken = isPatientAuthContext(auth);
    const syntheticPatient = isSyntheticPatientUid(auth?.uid);

    if (isPatientToken) {
      ensurePatientAuthMatches(auth, clinicId, doctorId, queueId, patientId);
      if (newStatus !== 'cancelled') {
        span.fail({ reason: 'patient-status-not-allowed', requested: newStatus });
        spanClosed = true;
        throw new functions.https.HttpsError('permission-denied', 'Patients can only cancel their own queue entry');
      }
    } else if (syntheticPatient) {
      const uidSuffix = auth?.uid?.split(':')[1] ?? null;
      if (!uidSuffix || uidSuffix !== patientId) {
        span.fail({ reason: 'patient-synthetic-mismatch', uid: auth?.uid ?? null });
        spanClosed = true;
        throw new functions.https.HttpsError('permission-denied', 'Patient identity does not match request');
      }
      if (newStatus !== 'cancelled') {
        span.fail({ reason: 'patient-synthetic-status', requested: newStatus });
        spanClosed = true;
        throw new functions.https.HttpsError('permission-denied', 'Patients can only cancel their own queue entry');
      }
    } else {
      await ensureStaffAccess(context, {
        clinicId,
        doctorId,
        action: 'update patient status'
      });
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
        const patientDocPromise = transaction.get(patientRef)
          .then((docSnap) => {
            readPatientSpan.succeed({ found: docSnap.exists });
            return docSnap;
          })
          .catch((readErr) => {
            readPatientSpan.fail({ error: readErr instanceof Error ? readErr.message : String(readErr) });
            throw readErr;
          });

        const patientDoc = await patientDocPromise;
        if (!patientDoc.exists) {
          throw new functions.https.HttpsError('not-found', 'Patient document not found.');
        }
        const patientData = patientDoc.data();
        const previousStatusRaw = (patientData as any)?.status as PatientStatus | undefined;
        const statusCounterFields: Record<PatientStatus, string> = {
          waiting: 'waitingPatients',
          'in-progress': 'inProgressPatients',
          completed: 'completedPatients',
          cancelled: 'cancelledPatients'
        };
        const statusChanged = previousStatusRaw !== newStatus;
        const queueCounterDeltas: Record<string, number> = {};
        const recordCounterDelta = (status: PatientStatus | undefined, delta: number) => {
          if (!status) {
            return;
          }
          const fieldKey = statusCounterFields[status];
          if (!fieldKey) {
            return;
          }
          queueCounterDeltas[fieldKey] = (queueCounterDeltas[fieldKey] ?? 0) + delta;
        };

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
      const baseUpdate: Record<string, unknown> = {
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp()
      };

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

      if (newStatus === 'cancelled') {
        const cancellationActor = (isPatientToken || syntheticPatient) ? 'patient-self' : 'staff';
        baseUpdate['cancellation.cancelledBy'] = cancellationActor;

        const hadCancelledAt = Boolean((patientData as any)?.cancellation?.cancelledAt);
        if (!hadCancelledAt) {
          baseUpdate['cancellation.cancelledAt'] = FieldValue.serverTimestamp();
        }
      }

      updatedPatientData = {
        ...patientData,
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp()
      };

      if (newStatus === 'cancelled') {
        const cancellationActor = (isPatientToken || syntheticPatient) ? 'patient-self' : 'staff';
        const existingCancellation = ((patientData as any)?.cancellation ?? {}) as Record<string, unknown>;
        const existingCancelledAt = existingCancellation['cancelledAt'];
        updatedPatientData = {
          ...updatedPatientData,
          cancellation: {
            ...existingCancellation,
            cancelledBy: cancellationActor,
            cancelledAt: existingCancelledAt ?? FieldValue.serverTimestamp()
          }
        };
      }

      if (statusChanged) {
        recordCounterDelta(previousStatusRaw, -1);
        recordCounterDelta(newStatus as PatientStatus, 1);
      }
      transaction.update(patientRef, baseUpdate);

      const queueUpdatePayload: Record<string, unknown> = {};
      for (const [field, delta] of Object.entries(queueCounterDeltas)) {
        if (!delta) {
          continue;
        }
        queueUpdatePayload[field] = FieldValue.increment(delta);
      }

      const patientTokenNumber = (patientData as any)?.tokenNumber || 0;
      if (newStatus === 'completed' || newStatus === 'in-progress') {
        queueUpdatePayload.currentToken = patientTokenNumber;
      }

      if (Object.keys(queueUpdatePayload).length > 0) {
        queueUpdatePayload.updatedAt = FieldValue.serverTimestamp();
        transaction.update(queueRef, queueUpdatePayload);
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

    await recordAnalyticsEvent('status_updated', {
      clinicId,
      doctorId,
      queueId,
      newStatus,
      patientHint: anonymizeIdentifier(patientId),
      anonUserId: anonymizeIdentifier(context.auth?.uid ?? null),
      actorType: isPatientToken ? 'patient-token' : syntheticPatient ? 'patient-synthetic' : 'staff'
    });

    const queueDocRef = queueRef;
    const patientDocRef = patientRef;

    let preloadedPatientSnap: admin.firestore.DocumentSnapshot<admin.firestore.DocumentData> | null = null;
    let preloadedQueueSnap: admin.firestore.DocumentSnapshot<admin.firestore.DocumentData> | null = null;

    if (phase1Enabled && newStatus === 'completed') {
      const [patientSnap, queueSnap] = await Promise.all([
        patientDocRef.get(),
        queueDocRef.get()
      ]);
      preloadedPatientSnap = patientSnap;
      preloadedQueueSnap = queueSnap;
    } else if (newStatus === 'completed') {
      preloadedQueueSnap = await queueDocRef.get();
    }

    // Phase 1 post-transaction logic
    // 1. If patient just completed: compute service duration & update queue avg service time; send completed notification once.
    // 2. Legacy staged notifications remain untouched for now (we append completed flow before them to avoid interfering).
    if (phase1Enabled && newStatus === 'completed') {
      schedulePhase1CompletionProcessing(db, {
        clinicId,
        doctorId,
        queueId,
        patientId,
        patientDocRef,
        queueDocRef,
        preloadedPatientSnap,
        preloadedQueueSnap
      });
      phase1BackgroundScheduled = true;
    }

    // Legacy staged notification logic removed (engine handles position). Only handle cancellation explicitly.
    if (newStatus === 'cancelled') {
      runInBackground('updatePatientStatus.cancelledNotification', async () => {
        try {
          const canSendCancelled = await isNotificationEnabled({
            clinicId,
            channel: 'whatsapp',
            event: 'tokenUpdates'
          });

          if (!canSendCancelled) {
            functions.logger.info('Skipping cancellation notification because clinic disabled token updates', {
              clinicId,
              doctorId,
              queueId,
              patientId
            });
            return;
          }

          await sendNotification({
            to: updatedPatientData?.phone,
            type: 'cancelled',
            payload: {
              name: updatedPatientData?.name,
              tokenNumber: updatedPatientData?.tokenNumber,
              clinicId,
              doctorId,
              queueId,
              message: 'Your queue entry has been cancelled. If this was a mistake, please contact the clinic to rejoin.'
            }
          });
        } catch (e) {
          functions.logger.warn('Failed to send cancellation notification', e);
        }
      });
    }

    // Server-side auto-advance: schedule promotion in background so the callable returns immediately
    if (newStatus === 'completed') {
      scheduleAutoAdvancePromotion(db, {
        clinicId,
        doctorId,
        queueId,
        patientId,
        queueDocRef: queueDocRef,
        preloadedQueueSnap
      });
      autoAdvanceScheduled = true;
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
      phase1DurationMs,
      phase1BackgroundScheduled,
      autoAdvanceScheduled
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

export const updatePatientStatus = createV2Callable(updatePatientStatusHandler, { memory: criticalMemory, cpu: criticalCpu });

let updatePatientStatusForCancel: typeof updatePatientStatusHandler = updatePatientStatusHandler;

const patientCancelTokenHandler = async (data: PatientCancelTokenRequest, _context: CallableCtx): Promise<PatientCancelTokenResult> => {
  const span = startTiming('patientCancelToken', {
    clinicId: data?.clinicId ?? null,
    doctorId: data?.doctorId ?? null,
    queueId: data?.queueId ?? null,
    patientId: data?.patientId ?? null
  });

  try {
    const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(data?.doctorId);
    const queueId = sanitizeFirestoreId(data?.queueId);
    const patientId = sanitizeFirestoreId(data?.patientId);
    const token = typeof data?.token === 'string' ? data.token.trim() : '';

    if (clinicResolution.shareCode) {
      functions.logger.debug('patientCancelToken clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode
      });
    }

    if (!doctorId || !queueId || !patientId || !token) {
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
        runInBackground('patientCancelToken.backfillCancelledAt', async () => {
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
        });
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

    runInBackground('patientCancelToken.recordCancellationMetadata', async () => {
      try {
        await patientRef.set(cancellationPatch, { merge: true });
      } catch (patchErr) {
        functions.logger.warn('Failed to record cancellation metadata', patchErr, { clinicId, doctorId, queueId, patientId });
      }
    });

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
    const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(data?.doctorId);
    const queueId = sanitizeFirestoreId(data?.queueId);
    const patientId = sanitizeFirestoreId(data?.patientId);
    const token = typeof data?.token === 'string' ? data.token.trim() : '';

    if (clinicResolution.shareCode) {
      functions.logger.debug('patientRejoinQueue clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode
      });
    }

    if (!doctorId || !queueId || !patientId || !token) {
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

    let sanitizedPatient;
    try {
      sanitizedPatient = sanitizePatientInput(
        {
          name: patientData?.name,
          age: patientData?.age,
          phone: patientData?.phone
        },
        { requirePhone: true }
      );
    } catch (error) {
      const reason = error instanceof PatientValidationError ? error.code : 'invalid-patient';
      span.fail({ reason });
      throw new functions.https.HttpsError('failed-precondition', 'Patient information is incomplete. Please join again from the clinic link.');
    }

    if (sanitizedPatient.age == null || !sanitizedPatient.phone) {
      span.fail({ reason: 'invalid-patient' });
      throw new functions.https.HttpsError('failed-precondition', 'Patient information is incomplete. Please join again from the clinic link.');
    }

    const joinResult = await joinQueueHandler({
      clinicId,
      doctorId,
      patientData: {
        name: sanitizedPatient.name,
        age: sanitizedPatient.age,
        phone: sanitizedPatient.phone
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
  },
  ensureStaffAccess,
  ensureDebugAccess,
  loadUserAccess,
  clearUserAccessCache() {
    userAccessCache.clear();
  }
};

const createStatusUpdateHandler = (targetStatus: PatientStatus) =>
  async (data: UpdatePatientStatusRequest, context: CallableCtx) => {
    return updatePatientStatusHandler({ ...data, newStatus: targetStatus }, context);
  };

export const callPatient = createV2Callable(createStatusUpdateHandler('in-progress'), { memory: criticalMemory, cpu: criticalCpu });
export const completePatient = createV2Callable(createStatusUpdateHandler('completed'), { memory: criticalMemory, cpu: criticalCpu });
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

    const { clinicId: rawClinicId, doctorId: rawDoctorId, queueId: rawQueueId } = data || {};
    if (!rawClinicId || !rawDoctorId || !rawQueueId) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, and queueId are required');
    }

    const clinicResolution = await resolveClinicIdentifier(rawClinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(rawDoctorId);
    const queueId = sanitizeFirestoreId(rawQueueId);

    if (!doctorId || !queueId) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'Invalid doctor or queue identifier');
    }

    if (clinicResolution.shareCode) {
      functions.logger.debug('advanceQueue clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode,
        uid: context.auth?.uid ?? null
      });
    }

    await ensureStaffAccess(context, {
      clinicId,
      doctorId,
      action: 'advance queue'
    });

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

    // Extract and validate required fields
    const {
      clinicId: rawClinicId,
      doctorId: rawDoctorId,
      queueId: rawQueueId,
      newStatus
    } = data;

    if (!rawClinicId || !rawDoctorId || !rawQueueId || !newStatus) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: clinicId, doctorId, queueId, and newStatus are required.'
      );
    }

    const clinicResolution = await resolveClinicIdentifier(rawClinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(rawDoctorId);
    const queueId = sanitizeFirestoreId(rawQueueId);

    if (!doctorId || !queueId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid doctor or queue identifier');
    }

    if (clinicResolution.shareCode) {
      functions.logger.debug('updateQueueStatus clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode,
        uid: _context.auth?.uid ?? null
      });
    }

    // Validate status values
    const validStatuses = ['active', 'paused', 'ended'];
    if (!validStatuses.includes(newStatus)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      );
    }

    await ensureStaffAccess(_context, {
      clinicId,
      doctorId,
      action: 'update queue status'
    });

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
    const { clinicId: rawClinicId, doctorId: rawDoctorId, queueId: rawQueueId, enabled } = data || {};
    if (!rawClinicId || !rawDoctorId || !rawQueueId || typeof enabled !== 'boolean') {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId, enabled(boolean) required');
    }
    const clinicResolution = await resolveClinicIdentifier(rawClinicId);
    const clinicId = clinicResolution.clinicId;
    const doctorId = sanitizeFirestoreId(rawDoctorId);
    const queueId = sanitizeFirestoreId(rawQueueId);

    if (!doctorId || !queueId) {
      span.fail({ reason: 'invalid-argument' });
      throw new functions.https.HttpsError('invalid-argument', 'Invalid doctor or queue identifier');
    }

    if (clinicResolution.shareCode) {
      functions.logger.debug('setQueueAutoAdvance clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode,
        uid: _context.auth?.uid ?? null
      });
    }

    await ensureStaffAccess(_context, {
      clinicId,
      doctorId,
      action: 'update queue auto-advance'
    });
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

export const setQueueAutoAdvance = createV2Callable(setQueueAutoAdvanceHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });

const setRealTimeStatusHandler = async (data: SetRealTimeStatusRequest, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  if (typeof data?.online !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'online must be a boolean');
  }

  const rawClinicId = typeof data?.clinicId === 'string' ? data.clinicId : '';
  const rawDoctorId = typeof data?.doctorId === 'string' ? data.doctorId : '';

  if (!rawClinicId || !rawDoctorId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId and doctorId are required');
  }

  const clinicResolution = await resolveClinicIdentifier(rawClinicId);
  const clinicId = clinicResolution.clinicId;
  const doctorId = sanitizeFirestoreId(rawDoctorId);

  if (!doctorId) {
    throw new functions.https.HttpsError('invalid-argument', 'doctorId is invalid');
  }

  if (clinicResolution.shareCode) {
    functions.logger.debug('setDoctorRealTimeStatus clinic resolved via share code', {
      requestedClinicId: clinicResolution.requestedId,
      clinicId,
      shareCode: clinicResolution.shareCode,
      uid: context.auth?.uid ?? null
    });
  }

  try {
    await ensureStaffAccess(context, {
      clinicId,
      doctorId,
      action: 'update doctor real-time status',
      allowClinicAdminWithoutDoctor: true
    });

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
  const span = startTiming('getClinicDoctorAvailability', {
    clinicId: data?.clinicId ?? null,
    requestedCount: Array.isArray(data?.doctorIds) ? data!.doctorIds!.length : 0
  });
  let spanClosed = false;

  if (!data || typeof data !== 'object') {
    span.fail({ reason: 'invalid-argument' });
    spanClosed = true;
    throw new functions.https.HttpsError('invalid-argument', 'Request payload must be an object');
  }

  try {
    const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
    const clinicId = clinicResolution.clinicId;

    if (clinicResolution.shareCode) {
      functions.logger.debug('getClinicDoctorAvailability clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId,
        shareCode: clinicResolution.shareCode
      });
    }

    const providedDoctorIds = Array.isArray(data.doctorIds) ? data.doctorIds : undefined;
    const sanitizedDoctorIds = providedDoctorIds
      ? providedDoctorIds
          .map((value) => sanitizeFirestoreId(value))
          .filter((value): value is string => typeof value === 'string')
      : [];

    if (providedDoctorIds && sanitizedDoctorIds.length === 0) {
      span.fail({ reason: 'invalid-doctor-ids' });
      spanClosed = true;
      throw new functions.https.HttpsError('invalid-argument', 'doctorIds must contain valid Firestore identifiers');
    }

    const uniqueDoctorIds = Array.from(new Set(sanitizedDoctorIds));

    const db = admin.firestore();
    const clinicRef = db.collection('clinics').doc(clinicId);

    const clinicSnap = await clinicRef.get();
    if (!clinicSnap.exists) {
      span.fail({ reason: 'clinic-not-found' });
      spanClosed = true;
      throw new functions.https.HttpsError('not-found', 'Clinic not found');
    }

    const pickString = (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const clinicSnapshotData = (clinicSnap.data() ?? {}) as Record<string, unknown>;
    const clinicSummary = {
      name: pickString(clinicSnapshotData['name']),
      address: pickString(clinicSnapshotData['address']),
      phone: pickString(clinicSnapshotData['phone'])
    };
    const clinicInfo =
      clinicSummary.name || clinicSummary.address || clinicSummary.phone ? clinicSummary : null;

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
      const response = {
        clinicId,
        count: 0,
        doctors: [],
        requestedDoctorIds: providedDoctorIds ? [] : undefined
      };
      span.succeed({ count: 0 });
      spanClosed = true;
      return response;
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

    const response = {
      clinicId,
      clinic: clinicInfo,
      count: doctors.length,
      doctors,
      requestedDoctorIds: providedDoctorIds ? targetDoctorIds : undefined
    };
    span.succeed({ count: doctors.length });
    spanClosed = true;
    return response;
  } catch (error) {
    if (!spanClosed) {
      span.fail({ error: error instanceof Error ? error.message : String(error) });
      spanClosed = true;
    }
    throw error;
  }
};

export const getClinicDoctorAvailability = createV2Callable(getClinicDoctorAvailabilityHandler, { memory: criticalMemory, cpu: criticalCpu });

const getClinicSchedulingSettingsHandler = async (
  data: GetClinicSchedulingSettingsRequest,
  _context: CallableCtx
) => {
  const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
  const clinicId = clinicResolution.clinicId;

  if (clinicResolution.shareCode) {
    functions.logger.debug('getClinicSchedulingSettings clinic resolved via share code', {
      requestedClinicId: clinicResolution.requestedId,
      clinicId,
      shareCode: clinicResolution.shareCode
    });
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

  const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
  const clinicId = clinicResolution.clinicId;

  if (clinicResolution.shareCode) {
    functions.logger.debug('updateClinicSchedulingSettings clinic resolved via share code', {
      requestedClinicId: clinicResolution.requestedId,
      clinicId,
      shareCode: clinicResolution.shareCode,
      uid: context.auth?.uid ?? null
    });
  }

  await ensureStaffAccess(context, {
    clinicId,
    action: 'update clinic scheduling settings',
    allowClinicAdminWithoutDoctor: true
  });

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

export const updateClinicSchedulingSettings = createV2Callable(updateClinicSchedulingSettingsHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });

const baseRequestDoctorOnlineNotificationHandler = createRequestDoctorOnlineNotificationHandler();

const requestDoctorOnlineNotificationHandler = async (
  data: RequestDoctorOnlineNotification,
  context: CallableCtx
) => {
  const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
  const canonicalClinicId = clinicResolution.clinicId;

  if (clinicResolution.shareCode) {
    functions.logger.debug('requestDoctorOnlineNotification clinic resolved via share code', {
      requestedClinicId: clinicResolution.requestedId,
      clinicId: canonicalClinicId,
      shareCode: clinicResolution.shareCode
    });
  }

  return baseRequestDoctorOnlineNotificationHandler(
    {
      ...data,
      clinicId: canonicalClinicId
    },
    context
  );
};

export const requestDoctorOnlineNotification = createV2Callable(requestDoctorOnlineNotificationHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });

const updateDefaultRotaHandler = async (data: UpdateDefaultRotaRequest, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const rawClinicId = typeof data?.clinicId === 'string' ? data.clinicId : '';
  const rawDoctorId = typeof data?.doctorId === 'string' ? data.doctorId : '';
  const timeZone = typeof data?.timeZone === 'string' ? data.timeZone.trim() : '';
  const week = (data?.week as Record<string, { start: string; end: string; label?: string | null }> | undefined) ?? {};

  if (!rawClinicId || !rawDoctorId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId and doctorId are required');
  }

  const clinicResolution = await resolveClinicIdentifier(rawClinicId);
  const clinicId = clinicResolution.clinicId;
  const doctorId = sanitizeFirestoreId(rawDoctorId);

  if (!doctorId) {
    throw new functions.https.HttpsError('invalid-argument', 'doctorId is invalid');
  }

  if (clinicResolution.shareCode) {
    functions.logger.debug('updateDoctorDefaultRota clinic resolved via share code', {
      requestedClinicId: clinicResolution.requestedId,
      clinicId,
      shareCode: clinicResolution.shareCode,
      uid: context.auth?.uid ?? null
    });
  }

  try {
    await ensureStaffAccess(context, {
      clinicId,
      doctorId,
      action: 'update default rota',
      allowClinicAdminWithoutDoctor: true
    });

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
    if (!payload.clinicId || !payload.doctorId) {
      throw new functions.https.HttpsError('invalid-argument', 'clinicId and doctorId are required');
    }

    const clinicResolution = await resolveClinicIdentifier(payload.clinicId);
    payload.clinicId = clinicResolution.clinicId;
    payload.doctorId = sanitizeFirestoreId(payload.doctorId) ?? '';

    if (!payload.doctorId) {
      throw new functions.https.HttpsError('invalid-argument', 'doctorId is invalid');
    }

    if (clinicResolution.shareCode) {
      functions.logger.debug('createDoctorScheduleOverride clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId: payload.clinicId,
        shareCode: clinicResolution.shareCode,
        uid: context.auth?.uid ?? null
      });
    }

    await ensureStaffAccess(context, {
      clinicId: payload.clinicId,
      doctorId: payload.doctorId,
      action: 'create schedule override',
      allowClinicAdminWithoutDoctor: true
    });

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

export const createDoctorScheduleOverride = createV2Callable(createOverrideHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });

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
    if (!payload.clinicId || !payload.doctorId) {
      throw new functions.https.HttpsError('invalid-argument', 'clinicId and doctorId are required');
    }

    const clinicResolution = await resolveClinicIdentifier(payload.clinicId);
    payload.clinicId = clinicResolution.clinicId;
    payload.doctorId = sanitizeFirestoreId(payload.doctorId) ?? '';

    if (!payload.doctorId) {
      throw new functions.https.HttpsError('invalid-argument', 'doctorId is invalid');
    }

    if (clinicResolution.shareCode) {
      functions.logger.debug('updateDoctorScheduleOverride clinic resolved via share code', {
        requestedClinicId: clinicResolution.requestedId,
        clinicId: payload.clinicId,
        shareCode: clinicResolution.shareCode,
        uid: context.auth?.uid ?? null
      });
    }

    await ensureStaffAccess(context, {
      clinicId: payload.clinicId,
      doctorId: payload.doctorId,
      action: 'update schedule override',
      allowClinicAdminWithoutDoctor: true
    });

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

export const updateDoctorScheduleOverride = createV2Callable(updateOverrideHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });

const deleteOverrideHandler = async (data: { clinicId?: string; doctorId?: string; overrideId?: string }, context: CallableCtx) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const rawClinicId = typeof data?.clinicId === 'string' ? data.clinicId : '';
  const rawDoctorId = typeof data?.doctorId === 'string' ? data.doctorId : '';
  const overrideId = typeof data?.overrideId === 'string' ? data.overrideId.trim() : '';

  if (!rawClinicId || !rawDoctorId || !overrideId) {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, and overrideId are required');
  }

  const clinicResolution = await resolveClinicIdentifier(rawClinicId);
  const clinicId = clinicResolution.clinicId;
  const doctorId = sanitizeFirestoreId(rawDoctorId);

  if (!doctorId) {
    throw new functions.https.HttpsError('invalid-argument', 'doctorId is invalid');
  }

  if (clinicResolution.shareCode) {
    functions.logger.debug('deleteDoctorScheduleOverride clinic resolved via share code', {
      requestedClinicId: clinicResolution.requestedId,
      clinicId,
      shareCode: clinicResolution.shareCode,
      uid: context.auth?.uid ?? null
    });
  }

  try {
    await ensureStaffAccess(context, {
      clinicId,
      doctorId,
      action: 'delete schedule override',
      allowClinicAdminWithoutDoctor: true
    });

    const result = await applyDeleteScheduleOverride({ clinicId, doctorId, overrideId });
    return { success: result.deleted };
  } catch (error) {
    mapSchedulingError(error, 'delete schedule override');
  }
};

export const deleteDoctorScheduleOverride = createV2Callable(deleteOverrideHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });

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
    const {
      clinicName,
      doctorName,
      specialty,
      clinicId: providedClinicId,
      doctorId: providedDoctorId,
      clinicPhone
    } = data || {};
    if (!clinicName || !doctorName || !specialty) {
      throw new functions.https.HttpsError('invalid-argument', 'clinicName, doctorName, specialty are required');
    }
    const db = admin.firestore();

    let clinicRef;
    if (providedClinicId) {
      const sanitizedClinicId = sanitizeFirestoreId(String(providedClinicId));
      if (!sanitizedClinicId) {
        throw new functions.https.HttpsError('invalid-argument', 'clinicId is invalid');
      }
      clinicRef = db.collection('clinics').doc(sanitizedClinicId);
    } else {
      clinicRef = db.collection('clinics').doc();
    }

    const clinicId = clinicRef.id;

    let doctorId: string | null = null;
    if (providedDoctorId) {
      doctorId = sanitizeFirestoreId(String(providedDoctorId));
      if (!doctorId) {
        throw new functions.https.HttpsError('invalid-argument', 'doctorId is invalid');
      }
    } else {
      doctorId = slugifyFirestoreId(doctorName, 'doctor');
    }

    const today = new Date().toISOString().split('T')[0];
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

    const clinicSlug = await ensureClinicSlug(clinicId, clinicName);
    const shareCode = await ensureClinicShareCode(clinicId);
    await Promise.all([
      clinicRef.set(
        {
          shareCode,
          shareCodeStatus: 'active',
          shareCodeAssignedAt: FieldValue.serverTimestamp(),
          displaySlug: clinicSlug,
          slugStatus: 'active',
          slugAssignedAt: FieldValue.serverTimestamp(),
          slugSource: 'bootstrapClinicAccount'
        },
        { merge: true }
      ),
      userRef.set(
        {
          clinicSlug
        },
        { merge: true }
      )
    ]);

    functions.logger.info('bootstrapClinicAccount complete', { clinicId, doctorId, shareCode, clinicSlug, uid: authUid });
    return { success: true, clinicId, clinicSlug, clinicShareCode: shareCode, doctorId, queueId: today };
  } catch (err) {
    functions.logger.error('bootstrapClinicAccount error', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', 'Failed to bootstrap clinic account');
  }
};

export const bootstrapClinicAccount = createV2Callable(bootstrapClinicAccountHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
