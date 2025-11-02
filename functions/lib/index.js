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
exports.bootstrapClinicAccount = exports.deleteDoctorScheduleOverride = exports.updateDoctorScheduleOverride = exports.createDoctorScheduleOverride = exports.updateDoctorDefaultRota = exports.requestDoctorOnlineNotification = exports.updateClinicSchedulingSettings = exports.getClinicSchedulingSettings = exports.getClinicDoctorAvailability = exports.setDoctorRealTimeStatus = exports.setQueueAutoAdvance = exports.updateQueueStatus = exports.advanceQueue = exports.uncallPatient = exports.cancelPatient = exports.completePatient = exports.callPatient = exports.__test__ = exports.patientRejoinQueue = exports.patientCancelToken = exports.updatePatientStatus = exports.createPatientSession = exports.getPatientView = exports.manualAddPatient = exports.joinQueue = exports.ping = exports.debugGetPatient = exports.debugRecompute = exports.debugPatientPwaBaseUrl = exports.debugRuntimeFlags = void 0;
const firestore_1 = require("firebase-admin/firestore");
// Ensure local .env variables are loaded when running in emulator / local scripts
const crypto_1 = __importDefault(require("crypto"));
const functions = __importStar(require("firebase-functions/v1"));
const v2_1 = require("firebase-functions/v2");
const https_1 = require("firebase-functions/v2/https");
const firebaseAdmin_1 = require("./firebaseAdmin");
require("./loadEnv");
// Import functions for local use
const notificationEngine_1 = require("./notificationEngine");
const notifier_1 = require("./notifier");
const patients_1 = require("./patients");
const availability_1 = require("./scheduling/availability");
const mutations_1 = require("./scheduling/mutations");
const notificationQueue_1 = require("./scheduling/notificationQueue");
const requestDoctorOnlineNotification_1 = require("./scheduling/requestDoctorOnlineNotification");
const settings_1 = require("./scheduling/settings");
const notificationPreferences_1 = require("./settings/notificationPreferences");
const patient_1 = require("./utils/patient");
const timing_1 = require("./utils/timing");
// Export functions from other files to make them deployable
__exportStar(require("./notifier"), exports);
__exportStar(require("./scheduling"), exports);
// Simplified CORS configuration:
// - Production: prefer origins supplied via environment variable CORS_ALLOWED_ORIGINS
// - Local dev fallback: allow localhost on the patient PWA dev port
// This provides a single, predictable production source of truth and a safe local fallback.
const defaultAllowedOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001'];
let allowedOrigins = defaultAllowedOrigins;
let allowedOriginsSource = 'defaults';
const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
if (allowedOriginsEnv && allowedOriginsEnv.trim().length > 0) {
    allowedOrigins = allowedOriginsEnv.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowedOrigins.length > 0) {
        allowedOriginsSource = 'env:CORS_ALLOWED_ORIGINS';
    }
    else {
        allowedOrigins = defaultAllowedOrigins;
    }
}
// This log runs ONCE when the function instance starts up.
// Feature flags NEW_NOTIFICATION_ENGINE / PHASE1_NOTIFICATIONS have been removed.
// Engine + Phase1 notifications are now permanently enabled (unless you change code).
console.log(`GLOBAL: Allowed origins loaded (${allowedOriginsSource}): [${allowedOrigins.join(", ")}]. Notification engine + phase1 ALWAYS ENABLED (flags removed).`);
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
// Persist resolver metadata without blocking the main response path.
const persistResolverDataAsync = (docRef, update, context) => {
    runInBackground(`patientResolver.persist.${context.source}`, async () => {
        const span = (0, timing_1.startTiming)('patientResolver.persist', {
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
        }
        catch (err) {
            span.fail({ error: err instanceof Error ? err.message : String(err) });
            functions.logger.warn('Failed to persist patient resolver data', {
                ...context,
                error: err instanceof Error ? err.message : String(err)
            });
        }
    });
};
const schedulePhase1CompletionProcessing = (db, options) => {
    runInBackground('updatePatientStatus.phase1Completion', async () => {
        const span = (0, timing_1.startTiming)('updatePatientStatus.phase1Completion', {
            clinicId: options.clinicId,
            doctorId: options.doctorId,
            queueId: options.queueId,
            patientId: options.patientId,
            mode: 'background'
        });
        const phaseStarted = process.hrtime.bigint();
        let serviceDurationMs;
        try {
            const patientSnap = options.preloadedPatientSnap ?? (await options.patientDocRef.get());
            const latest = patientSnap.data();
            const svc = latest?.service || {};
            if (svc.startedAt && svc.completedAt && !svc.serviceDurationMs) {
                try {
                    if (typeof svc.startedAt.toMillis === 'function' && typeof svc.completedAt.toMillis === 'function') {
                        serviceDurationMs = svc.completedAt.toMillis() - svc.startedAt.toMillis();
                    }
                }
                catch (err) {
                    functions.logger.warn('Failed to compute service duration', {
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
                }
                catch (err) {
                    functions.logger.warn('Phase1 failed to persist serviceDurationMs', {
                        clinicId: options.clinicId,
                        doctorId: options.doctorId,
                        queueId: options.queueId,
                        patientId: options.patientId,
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }
            if (serviceDurationMs && serviceDurationMs > 0) {
                const emaSpan = (0, timing_1.startTiming)('updatePatientStatus.phase1Completion.updateQueueAvg', {
                    clinicId: options.clinicId,
                    doctorId: options.doctorId,
                    queueId: options.queueId,
                    patientId: options.patientId,
                    serviceDurationMs
                });
                try {
                    await db.runTransaction(async (tx) => {
                        const qDoc = await tx.get(options.queueDocRef);
                        if (qDoc.exists) {
                            const qd = qDoc.data() || {};
                            const oldAvg = qd?.metrics?.avgServiceMs;
                            const alpha = 0.2;
                            const newAvg = oldAvg ? Math.round(oldAvg * (1 - alpha) + serviceDurationMs * alpha) : serviceDurationMs;
                            const metrics = { ...(qd.metrics || {}), avgServiceMs: newAvg, updatedAt: firestore_1.FieldValue.serverTimestamp() };
                            tx.set(options.queueDocRef, { metrics }, { merge: true });
                            functions.logger.debug('Phase1 updated queue avgServiceMs (background)', {
                                queueId: options.queueId,
                                newAvg,
                                serviceDurationMs
                            });
                        }
                    });
                    emaSpan.succeed({ updated: true });
                }
                catch (err) {
                    emaSpan.fail({ error: err instanceof Error ? err.message : String(err) });
                    functions.logger.warn('Phase1 failed to update queue average service time', {
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
                    const completedSpan = (0, timing_1.startTiming)('updatePatientStatus.phase1Completion.completedNotification', {
                        clinicId: options.clinicId,
                        doctorId: options.doctorId,
                        queueId: options.queueId,
                        patientId: options.patientId
                    });
                    try {
                        const canSendCompleted = await (0, notificationPreferences_1.isNotificationEnabled)({
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
                        }
                        catch (flagErr) {
                            functions.logger.warn('Failed to mark completed notification flag', {
                                clinicId: options.clinicId,
                                doctorId: options.doctorId,
                                queueId: options.queueId,
                                patientId: options.patientId,
                                error: flagErr instanceof Error ? flagErr.message : String(flagErr)
                            });
                        }
                        await (0, notifier_1.sendNotification)({
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
                    }
                    catch (err) {
                        completedSpan.fail({ error: err instanceof Error ? err.message : String(err) });
                        functions.logger.warn('Failed to send completed notification', err);
                    }
                });
            }
            const phaseFinished = process.hrtime.bigint();
            const durationMs = Number(phaseFinished - phaseStarted) / 1000000;
            span.succeed({ serviceDurationMs: serviceDurationMs ?? null, durationMs });
        }
        catch (err) {
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
const scheduleAutoAdvancePromotion = (db, options) => {
    runInBackground('updatePatientStatus.autoAdvance', async () => {
        const autoSpan = (0, timing_1.startTiming)('updatePatientStatus.autoAdvance', {
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
            const qData = queueSnap.data() || {};
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
            const nextData = nextDoc.data();
            const nextToken = nextData?.tokenNumber || 0;
            await Promise.all([
                nextDoc.ref.update({ status: 'in-progress', updatedAt: firestore_1.FieldValue.serverTimestamp() }),
                options.queueDocRef.update({ currentToken: nextToken, updatedAt: firestore_1.FieldValue.serverTimestamp() })
            ]);
            functions.logger.info('Auto-advance promoted next patient (background)', {
                nextPatientId: nextDoc.id,
                nextToken,
                clinicId: options.clinicId,
                doctorId: options.doctorId,
                queueId: options.queueId
            });
            autoSpan.succeed({ promoted: true, nextPatientId: nextDoc.id });
        }
        catch (err) {
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
let warmPoolMinInstances;
if (!Number.isNaN(parsedMinInstances) && parsedMinInstances > 0) {
    warmPoolMinInstances = parsedMinInstances;
    console.log(`Runtime warm pool enabled with minInstances=${parsedMinInstances}`);
}
else {
    console.log('Runtime warm pool disabled; using on-demand scaling.');
}
const v2GlobalOptions = {
    region: 'asia-south1',
    timeoutSeconds: callableTimeoutSeconds,
    memory: standardMemory, // Default to standard tier
    cpu: standardCpu, // 0.5 CPU for most functions
    maxInstances: callableMaxInstances
};
if (typeof warmPoolMinInstances === 'number') {
    v2GlobalOptions.minInstances = warmPoolMinInstances;
}
(0, v2_1.setGlobalOptions)(v2GlobalOptions);
const adaptCallableContext = (request) => {
    let auth = request.auth;
    if (!auth) {
        const rawHeaders = request.rawRequest?.headers || {};
        const fallback = rawHeaders['x-callable-context-auth'];
        if (typeof fallback === 'string') {
            try {
                const decoded = decodeURIComponent(fallback);
                const parsed = JSON.parse(decoded);
                auth = parsed;
            }
            catch (err) {
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
const createV2Callable = (handler, options) => (0, https_1.onCall)(options ?? {}, (request) => handler(request.data, adaptCallableContext(request)));
const mapSchedulingError = (error, action) => {
    if (error instanceof mutations_1.ValidationError) {
        throw new functions.https.HttpsError('invalid-argument', error.message);
    }
    if (error instanceof mutations_1.NotFoundError) {
        throw new functions.https.HttpsError('not-found', error.message);
    }
    functions.logger.error(`Scheduling action ${action} failed`, {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        action
    });
    throw new functions.https.HttpsError('internal', `Failed to ${action}`);
};
const sanitizeFirestoreId = (value) => {
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
const SHARE_CODE_CACHE_TTL_MS = 5 * 60 * 1000;
const clinicShareCodeCache = new Map();
const SHARE_CODE_GENERATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARE_CODE_GROUP_LENGTH = 4;
const SHARE_CODE_GROUP_COUNT = 2;
const SHARE_CODE_MAX_ATTEMPTS = 20;
const isShareCodeDocActive = (doc) => {
    if (!doc) {
        return false;
    }
    const status = typeof doc.status === 'string' ? doc.status.toLowerCase() : 'active';
    const disabled = doc.disabled === true;
    return !disabled && status !== 'disabled' && status !== 'revoked';
};
const generateClinicShareCodeCandidate = () => {
    const requiredChars = SHARE_CODE_GROUP_LENGTH * SHARE_CODE_GROUP_COUNT;
    const random = crypto_1.default.randomBytes(requiredChars);
    let raw = '';
    for (let i = 0; i < requiredChars; i += 1) {
        const index = random[i] % SHARE_CODE_GENERATION_ALPHABET.length;
        raw += SHARE_CODE_GENERATION_ALPHABET[index];
    }
    const groups = [];
    for (let groupIndex = 0; groupIndex < SHARE_CODE_GROUP_COUNT; groupIndex += 1) {
        const start = groupIndex * SHARE_CODE_GROUP_LENGTH;
        groups.push(raw.slice(start, start + SHARE_CODE_GROUP_LENGTH));
    }
    return groups.join('-');
};
const isAlreadyExistsError = (error) => {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const code = error.code;
    if (code === 6 || code === 'already-exists') {
        return true;
    }
    const message = error instanceof Error ? error.message : String(error.message ?? '');
    return /\balready exists\b/i.test(message);
};
const ensureClinicShareCode = async (clinicId) => {
    const db = firebaseAdmin_1.admin.firestore();
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
                resolution: 'share-code'
            }),
            expiresAt: Date.now() + SHARE_CODE_CACHE_TTL_MS
        });
        return shareCode;
    }
    const legacySnap = await shareCodes.where('clinicId', '==', clinicId).limit(10).get();
    const legacyDoc = legacySnap.docs.find((docSnap) => isShareCodeDocActive(docSnap.data()));
    if (legacyDoc) {
        const legacyRef = shareCodes.doc(legacyDoc.id);
        await legacyRef.set({
            canonicalClinicId: clinicId,
            disabled: false,
            status: 'active',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        const shareCode = legacyDoc.id;
        clinicShareCodeCache.set(shareCode, {
            promise: Promise.resolve({
                clinicId,
                shareCode,
                requestedId: shareCode,
                resolution: 'share-code'
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
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                issuedAt: firestore_1.FieldValue.serverTimestamp(),
                issuedBy: 'bootstrapClinicAccount'
            });
            clinicShareCodeCache.set(candidate, {
                promise: Promise.resolve({
                    clinicId,
                    shareCode: candidate,
                    requestedId: candidate,
                    resolution: 'share-code'
                }),
                expiresAt: Date.now() + SHARE_CODE_CACHE_TTL_MS
            });
            return candidate;
        }
        catch (error) {
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
const normalizeClinicShareCode = (value) => {
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
const loadClinicByShareCode = (shareCode) => {
    const existing = clinicShareCodeCache.get(shareCode);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
        return existing.promise;
    }
    const promise = (async () => {
        const snapshot = await firebaseAdmin_1.admin.firestore()
            .collection(CLINIC_SHARE_CODES_COLLECTION)
            .doc(shareCode)
            .get();
        if (!snapshot.exists) {
            return null;
        }
        const data = snapshot.data();
        const candidateId = typeof data?.canonicalClinicId === 'string' ? data.canonicalClinicId :
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
            throw new functions.https.HttpsError('failed-precondition', 'Clinic code is inactive. Please contact the clinic for a new code.');
        }
        return {
            clinicId: sanitizedClinicId,
            shareCode,
            resolution: 'share-code',
            requestedId: shareCode
        };
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
const resolveClinicIdentifier = async (value, options = {}) => {
    const fieldName = options.fieldName ?? 'clinicId';
    const requestedId = typeof value === 'string' ? value.trim() : '';
    if (!requestedId) {
        throw new functions.https.HttpsError('invalid-argument', `${fieldName} is required`);
    }
    const shareCodeNormalized = options.allowShareCodeLookup === false ? null : normalizeClinicShareCode(requestedId);
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
                return { ...resolved, requestedId };
            }
        }
        catch (error) {
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
    const sanitized = sanitizeFirestoreId(requestedId);
    if (!sanitized) {
        throw new functions.https.HttpsError('invalid-argument', `${fieldName} is invalid`);
    }
    return {
        clinicId: sanitized,
        resolution: 'canonical',
        shareCode: null,
        requestedId
    };
};
const serializeOverride = (override) => {
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
const serializeAvailability = (result) => {
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
const userAccessCache = new Map();
const toTrimmedString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const toStringArray = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);
};
const toDoctorAssignments = (value) => {
    if (typeof value !== 'object' || value === null) {
        return {};
    }
    const result = {};
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
const mergeUniqueIds = (...lists) => {
    const set = new Set();
    for (const list of lists) {
        for (const entry of list) {
            if (entry) {
                set.add(entry);
            }
        }
    }
    return Array.from(set);
};
const loadUserAccess = async (uid) => {
    const cached = userAccessCache.get(uid);
    if (cached) {
        return cached;
    }
    const promise = (async () => {
        try {
            const snap = await firebaseAdmin_1.admin.firestore().collection('users').doc(uid).get();
            const data = (snap.exists ? snap.data() : undefined) || {};
            const primaryClinicId = toTrimmedString(data['clinicId']);
            const primaryDoctorId = toTrimmedString(data['doctorId']);
            const additionalClinicIds = mergeUniqueIds(toStringArray(data['clinicIds']), toStringArray(data['staffClinicIds']), toStringArray(data['managedClinics']), toStringArray(data['additionalClinicIds']));
            const doctorAssignmentsRaw = {
                ...(typeof data['doctorAssignments'] === 'object'
                    ? data['doctorAssignments']
                    : {}),
                ...(typeof data['staffDoctorIds'] === 'object'
                    ? data['staffDoctorIds']
                    : {})
            };
            const doctorAssignments = toDoctorAssignments(doctorAssignmentsRaw);
            const roles = mergeUniqueIds(toStringArray(data['roles']));
            return {
                primaryClinicId,
                primaryDoctorId,
                additionalClinicIds,
                doctorAssignments,
                roles
            };
        }
        catch (error) {
            userAccessCache.delete(uid);
            throw error;
        }
    })();
    userAccessCache.set(uid, promise);
    return promise;
};
const collectClinicIds = (access) => {
    const ids = new Set();
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
const hasClinicAccess = (access, clinicId) => {
    if (!clinicId) {
        return false;
    }
    return collectClinicIds(access).has(clinicId);
};
const hasDoctorAccess = (access, clinicId, doctorId) => {
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
const isPatientAuthContext = (auth) => {
    return Boolean(auth?.token && auth.token?.['patient'] === true);
};
const isSyntheticPatientUid = (uid) => {
    if (typeof uid !== 'string') {
        return false;
    }
    return uid.startsWith('patient-self:') || uid.startsWith('patient_');
};
const ensurePatientAuthMatches = (auth, clinicId, doctorId, queueId, patientId) => {
    const token = auth.token;
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
const ensureStaffAccess = async (context, options) => {
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
        const doctorAllowed = hasDoctorAccess(access, options.clinicId, options.doctorId) ||
            (options.allowClinicAdminWithoutDoctor === true && access.roles.includes('clinic-admin'));
        if (!doctorAllowed) {
            throw new functions.https.HttpsError('permission-denied', `Not authorized to ${options.action} for this doctor`);
        }
    }
};
const debugEndpointsEnabled = () => {
    return process.env.ENABLE_DEBUG_ENDPOINTS === 'true' || process.env.FUNCTIONS_EMULATOR === 'true';
};
const ensureDebugAccess = async (context, options, requireAuth = true) => {
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
const hashAccessToken = (token) => crypto_1.default.createHash('sha256').update(String(token)).digest('hex');
/** DEBUG: Returns runtime flag visibility and Node version */
const debugRuntimeFlagsHandler = async (_data, _ctx) => {
    await ensureDebugAccess(_ctx, null, false);
    let resolverFlag = null;
    try {
        resolverFlag = await (0, patients_1.currentPatientResolverFlagSnapshot)({ forceReload: true });
    }
    catch (error) {
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
exports.debugRuntimeFlags = createV2Callable(debugRuntimeFlagsHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });
/** DEBUG: Show resolved Patient PWA base URL */
const debugPatientPwaBaseUrlHandler = async (_data, _ctx) => {
    await ensureDebugAccess(_ctx, null, false);
    try {
        const envValRaw = process.env.PATIENT_PWA_BASE_URL;
        const envVal = envValRaw && envValRaw.trim().length > 0 ? envValRaw.trim() : null;
        const resolved = envVal;
        return { env: !!envVal, envVal, resolved };
    }
    catch (e) {
        return { error: e?.message || String(e) };
    }
};
exports.debugPatientPwaBaseUrl = createV2Callable(debugPatientPwaBaseUrlHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });
/** DEBUG: Force recompute for a queue (engine default-on). data: { clinicId, doctorId, queueId } */
const debugRecomputeHandler = async (data, _ctx) => {
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
    const result = await (0, notificationEngine_1.recomputeQueueNotifications)({ clinicId, doctorId, queueId });
    return { success: true, result };
};
exports.debugRecompute = createV2Callable(debugRecomputeHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });
/** DEBUG: Fetch patient doc raw (no auth). data: { clinicId, doctorId, queueId, patientId } */
const debugGetPatientHandler = async (data, _ctx) => {
    const { clinicId, doctorId, queueId, patientId } = data || {};
    if (!clinicId || !doctorId || !queueId || !patientId) {
        throw new functions.https.HttpsError('invalid-argument', 'clinicId, doctorId, queueId, patientId required');
    }
    await ensureDebugAccess(_ctx, {
        clinicId,
        doctorId,
        action: 'debug get patient'
    });
    const snap = await firebaseAdmin_1.admin.firestore().collection('clinics').doc(clinicId)
        .collection('doctors').doc(doctorId)
        .collection('queues').doc(queueId)
        .collection('patients').doc(patientId).get();
    if (!snap.exists)
        return { found: false };
    return { found: true, data: snap.data() };
};
exports.debugGetPatient = createV2Callable(debugGetPatientHandler, { maxInstances: 1, memory: lessFrequentMemory, cpu: lessFrequentCpu });
// NOTE: Staff privilege checks are enforced via ensureStaffAccess for protected operations.
// Simple HTTPS callable function example
const pingHandler = async (data, context) => {
    return { message: 'pong', received: data ?? null, uid: context.auth?.uid ?? null };
};
exports.ping = createV2Callable(pingHandler);
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
const joinQueueHandler = async (data, _context) => {
    const span = (0, timing_1.startTiming)('joinQueue', {
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
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, and patientData are required.');
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
            normalizedPatient = (0, patient_1.sanitizePatientInput)(patientData, { requirePhone: true });
        }
        catch (error) {
            const message = error instanceof patient_1.PatientValidationError ? error.message : 'Invalid patient data';
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
        const normalizedFullName = (0, patients_1.normalizePatientFullName)(normalizedName);
        const resolverMetadata = {};
        if (typeof normalizedAge === 'number') {
            resolverMetadata.age = normalizedAge;
        }
        const resolverEnabled = await (0, patients_1.isPatientResolverV1Enabled)({ allowDryRun: true });
        let patientResolverResult = null;
        let patientIdentityLink = null;
        let patientResolverSummary = null;
        const availability = await (0, availability_1.resolveDoctorAvailability)({
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
            throw new functions.https.HttpsError('failed-precondition', availability.message ?? 'Doctor is currently unavailable.', { availability: serialized });
        }
        // 1. Get current date in YYYY-MM-DD format for the queue ID
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        // 2. Define database references
        const db = firebaseAdmin_1.admin.firestore();
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
                name: normalizedName,
                age: normalizedAge,
                phone: normalizedPhone,
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
        const patientDocRef = patientsRef.doc(newPatientData.id);
        // Send "joined" notification without blocking the response path
        runInBackground('joinQueue.sendJoinedNotification', async () => {
            try {
                const canSendJoined = await (0, notificationPreferences_1.isNotificationEnabled)({
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
                }
                catch (e) {
                    functions.logger.warn('Failed to mark joined notification on patient doc', e);
                }
                await (0, notifier_1.sendNotification)({
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
            }
            catch (notifyErr) {
                functions.logger.warn('Failed to send joined notification (background):', notifyErr);
            }
        });
        if (resolverEnabled) {
            try {
                patientResolverResult = await (0, patients_1.resolvePatientForQueue)({
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
                patientIdentityLink = (0, patients_1.buildQueuePatientLink)(patientResolverResult);
                patientResolverSummary = {
                    version: patientResolverResult.resolverVersion,
                    matchType: patientResolverResult.matchType,
                    confidence: patientResolverResult.confidence,
                    requiresReview: patientResolverResult.requiresReview,
                    metadataVersion: patientResolverResult.metadataVersion,
                    ambiguityId: patientResolverResult.ambiguityEntryRef?.id ?? null
                };
                const resolverUpdate = {
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
            }
            catch (resolverError) {
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
        const response = {
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
    }
    catch (error) {
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
        throw new functions.https.HttpsError('internal', 'An internal error occurred while trying to join the queue.');
    }
};
exports.joinQueue = createV2Callable(joinQueueHandler, { memory: criticalMemory, cpu: criticalCpu });
const manualAddPatientHandler = async (data, context) => {
    const authUid = context.auth?.uid ?? null;
    const span = (0, timing_1.startTiming)('manualAddPatient', {
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
        let sanitizedPatient;
        try {
            sanitizedPatient = (0, patient_1.sanitizePatientInput)(patientInput, { requirePhone: false, requireAge: false });
        }
        catch (error) {
            if (error instanceof patient_1.PatientValidationError) {
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
        let phone = sanitizedPatient.phone;
        const suppressNotification = data?.suppressNotification === true;
        const normalizedFullName = (0, patients_1.normalizePatientFullName)(rawName);
        const resolverMetadata = {};
        if (typeof age === 'number') {
            resolverMetadata.age = age;
        }
        const resolverEnabled = await (0, patients_1.isPatientResolverV1Enabled)({ allowDryRun: true, allowPilot: true });
        let patientResolverResult = null;
        let patientIdentityLink = null;
        let patientResolverSummary = null;
        const db = firebaseAdmin_1.admin.firestore();
        const queueRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        const patientsRef = queueRef.collection('patients');
        let newPatientId = '';
        let newTokenNumber = 0;
        let rawAccessToken = '';
        await db.runTransaction(async (transaction) => {
            const queueSnap = await transaction.get(queueRef);
            const queueData = queueSnap.exists ? queueSnap.data() : undefined;
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
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
            else {
                const currentTotal = queueData?.totalPatients ?? 0;
                newTokenNumber = currentTotal + 1;
                transaction.update(queueRef, {
                    totalPatients: newTokenNumber,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
            const patientRef = patientsRef.doc();
            newPatientId = patientRef.id;
            rawAccessToken = crypto_1.default.randomBytes(32).toString('hex');
            const accessTokenHash = crypto_1.default.createHash('sha256').update(rawAccessToken).digest('hex');
            const patientDoc = {
                id: newPatientId,
                name: rawName,
                tokenNumber: newTokenNumber,
                status: 'waiting',
                joinedAt: firestore_1.FieldValue.serverTimestamp(),
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
                    const canSendJoined = await (0, notificationPreferences_1.isNotificationEnabled)({
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
                    }
                    catch (flagErr) {
                        functions.logger.warn('Failed to mark manual joined notification flag', flagErr, {
                            clinicId,
                            doctorId,
                            queueId,
                            patientId: newPatientId
                        });
                    }
                    await (0, notifier_1.sendNotification)({
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
                }
                catch (notifyErr) {
                    functions.logger.warn('Failed to send manual joined notification (background)', notifyErr, {
                        clinicId,
                        doctorId,
                        queueId,
                        patientId: newPatientId
                    });
                }
            });
        }
        else if (suppressNotification) {
            runInBackground('manualAddPatient.recordJoinedSuppression', async () => {
                try {
                    await patientDocRef.set({ notifications: { joinedSuppressed: true } }, { merge: true });
                }
                catch (notifyFlagErr) {
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
                patientResolverResult = await (0, patients_1.resolvePatientForQueue)({
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
                patientIdentityLink = (0, patients_1.buildQueuePatientLink)(patientResolverResult);
                patientResolverSummary = {
                    version: patientResolverResult.resolverVersion,
                    matchType: patientResolverResult.matchType,
                    confidence: patientResolverResult.confidence,
                    requiresReview: patientResolverResult.requiresReview,
                    metadataVersion: patientResolverResult.metadataVersion,
                    ambiguityId: patientResolverResult.ambiguityEntryRef?.id ?? null
                };
                const resolverUpdate = {
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
            }
            catch (resolverError) {
                functions.logger.error('manualAddPatient resolver failed', {
                    clinicId,
                    doctorId,
                    queueId,
                    patientDocId: newPatientId,
                    error: resolverError instanceof Error ? resolverError.message : String(resolverError)
                });
            }
        }
        runInBackground('manualAddPatient.recompute', () => (0, notificationEngine_1.recomputeQueueNotifications)({ clinicId, doctorId, queueId }));
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
        };
    }
    catch (error) {
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
exports.manualAddPatient = createV2Callable(manualAddPatientHandler, { memory: criticalMemory, cpu: criticalCpu });
/**
 * Callable Cloud Function to return a patient's view after validating a short-lived token.
 * Expected data: { clinicId, doctorId, queueId, patientId, token }
 */
const getPatientViewHandler = async (data, _context) => {
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
        const db = firebaseAdmin_1.admin.firestore();
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
};
exports.getPatientView = createV2Callable(getPatientViewHandler);
const isSignBlobPermissionError = (error) => {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const candidate = error;
    const code = candidate.errorInfo?.code ?? candidate.code;
    if (code !== 'auth/insufficient-permission') {
        return false;
    }
    const message = candidate.errorInfo?.message ?? candidate.message;
    return typeof message === 'string' && message.includes('iam.serviceAccounts.signBlob');
};
const createPatientSessionHandler = async (data, _context) => {
    const { clinicId: rawClinicId, doctorId: rawDoctorId, queueId: rawQueueId, patientId: rawPatientId, token } = data || {};
    let clinicId = null;
    let doctorId = null;
    let queueId = null;
    let patientId = null;
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
        const db = firebaseAdmin_1.admin.firestore();
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
        const tokenHash = hashAccessToken(token);
        if (tokenHash !== storedHash) {
            throw new functions.https.HttpsError('permission-denied', 'Invalid token');
        }
        if (typeof patientData?.queueId === 'string' && patientData.queueId !== queueId) {
            throw new functions.https.HttpsError('permission-denied', 'Invalid token');
        }
        const patientUid = `patient_${tokenHash}`;
        const customToken = await firebaseAdmin_1.admin.auth().createCustomToken(patientUid, {
            patient: true,
            patientClinicId: clinicId,
            patientDoctorId: doctorId,
            patientQueueId: queueId,
            patientId,
            patientTokenHash: tokenHash
        });
        const safePatient = { ...(patientData ?? {}), id: patientId };
        delete safePatient.accessTokenHash;
        return {
            success: true,
            token: customToken,
            patient: safePatient
        };
    }
    catch (error) {
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
exports.createPatientSession = createV2Callable(createPatientSessionHandler);
/**
 * Firebase Callable Function to update a patient's status in the queue
 * Requires authentication and handles queue metadata updates when patients are completed
 *
 * @param data - Object containing clinicId, doctorId, queueId, patientId, and newStatus
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and updated patient data
 */
const updatePatientStatusHandler = async (data, context) => {
    const span = (0, timing_1.startTiming)('updatePatientStatus', {
        uid: context.auth?.uid ?? null,
        clinicId: data?.clinicId,
        doctorId: data?.doctorId,
        queueId: data?.queueId,
        newStatus: data?.newStatus
    });
    let autoAdvancePromoted = null;
    let recomputeTriggered = false;
    let phase1DurationMs = null;
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
        const { clinicId: rawClinicId, doctorId: rawDoctorId, queueId: rawQueueId, patientId: rawPatientId, newStatus } = data;
        if (!rawClinicId || !rawDoctorId || !rawQueueId || !rawPatientId || !newStatus) {
            span.fail({ reason: 'invalid-argument' });
            spanClosed = true;
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, patientId, and newStatus are required.');
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
            throw new functions.https.HttpsError('invalid-argument', `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
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
        }
        else if (syntheticPatient) {
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
        }
        else {
            await ensureStaffAccess(context, {
                clinicId,
                doctorId,
                action: 'update patient status'
            });
        }
        // Define database references
        const db = firebaseAdmin_1.admin.firestore();
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
                const patientDocPromise = transaction.get(patientRef)
                    .then((docSnap) => {
                    readPatientSpan.succeed({ found: docSnap.exists });
                    return docSnap;
                })
                    .catch((readErr) => {
                    readPatientSpan.fail({ error: readErr instanceof Error ? readErr.message : String(readErr) });
                    throw readErr;
                });
                // 2. If completing OR moving to in-progress we need queue doc (start read before awaiting patient)
                let queueDocPromise = null;
                let readQueueSpan = null;
                if (newStatus === 'completed' || newStatus === 'in-progress') {
                    readQueueSpan = (0, timing_1.startTiming)('updatePatientStatus.transaction.readQueue', {
                        clinicId,
                        doctorId,
                        queueId,
                        newStatus
                    });
                    queueDocPromise = transaction.get(queueRef)
                        .then((docSnap) => {
                        readQueueSpan?.succeed({ found: docSnap.exists });
                        return docSnap;
                    })
                        .catch((queueErr) => {
                        readQueueSpan?.fail({ error: queueErr instanceof Error ? queueErr.message : String(queueErr) });
                        throw queueErr;
                    });
                }
                const patientDoc = await patientDocPromise;
                if (!patientDoc.exists) {
                    throw new functions.https.HttpsError('not-found', 'Patient document not found.');
                }
                const patientData = patientDoc.data();
                let queueDoc = null;
                if (queueDocPromise) {
                    queueDoc = await queueDocPromise;
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
                const baseUpdate = {
                    status: newStatus,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                };
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
                if (newStatus === 'cancelled') {
                    const cancellationActor = (isPatientToken || syntheticPatient) ? 'patient-self' : 'staff';
                    baseUpdate['cancellation.cancelledBy'] = cancellationActor;
                    const hadCancelledAt = Boolean(patientData?.cancellation?.cancelledAt);
                    if (!hadCancelledAt) {
                        baseUpdate['cancellation.cancelledAt'] = firestore_1.FieldValue.serverTimestamp();
                    }
                }
                updatedPatientData = {
                    ...patientData,
                    status: newStatus,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                };
                if (newStatus === 'cancelled') {
                    const cancellationActor = (isPatientToken || syntheticPatient) ? 'patient-self' : 'staff';
                    const existingCancellation = (patientData?.cancellation ?? {});
                    const existingCancelledAt = existingCancellation['cancelledAt'];
                    updatedPatientData = {
                        ...updatedPatientData,
                        cancellation: {
                            ...existingCancellation,
                            cancelledBy: cancellationActor,
                            cancelledAt: existingCancelledAt ?? firestore_1.FieldValue.serverTimestamp()
                        }
                    };
                }
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
        const queueDocRef = queueRef;
        const patientDocRef = patientRef;
        let preloadedPatientSnap = null;
        let preloadedQueueSnap = null;
        if (phase1Enabled && newStatus === 'completed') {
            const [patientSnap, queueSnap] = await Promise.all([
                patientDocRef.get(),
                queueDocRef.get()
            ]);
            preloadedPatientSnap = patientSnap;
            preloadedQueueSnap = queueSnap;
        }
        else if (newStatus === 'completed') {
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
                    const canSendCancelled = await (0, notificationPreferences_1.isNotificationEnabled)({
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
                    await (0, notifier_1.sendNotification)({
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
                }
                catch (e) {
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
        if (['completed', 'in-progress', 'cancelled'].includes(newStatus)) {
            functions.logger.debug('Notification engine recompute (default-on)', { clinicId, doctorId, queueId, newStatus });
            runInBackground('notificationEngine.recompute', () => (0, notificationEngine_1.recomputeQueueNotifications)({ clinicId, doctorId, queueId }));
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
};
exports.updatePatientStatus = createV2Callable(updatePatientStatusHandler, { memory: criticalMemory, cpu: criticalCpu });
let updatePatientStatusForCancel = updatePatientStatusHandler;
const patientCancelTokenHandler = async (data, _context) => {
    const span = (0, timing_1.startTiming)('patientCancelToken', {
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
        const db = firebaseAdmin_1.admin.firestore();
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
        const patientData = patientSnap.data();
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
        const currentStatus = patientData?.status ?? 'waiting';
        if (currentStatus === 'cancelled') {
            const existingCancellation = (patientData?.cancellation ?? {});
            if (!existingCancellation?.cancelledAt) {
                runInBackground('patientCancelToken.backfillCancelledAt', async () => {
                    try {
                        await patientRef.set({
                            cancellation: {
                                ...existingCancellation,
                                cancelledAt: firestore_1.FieldValue.serverTimestamp(),
                                cancelledBy: existingCancellation?.cancelledBy ?? 'patient-self'
                            }
                        }, { merge: true });
                    }
                    catch (patchErr) {
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
            };
        }
        if (currentStatus !== 'waiting') {
            span.fail({ reason: 'status-not-waiting', status: currentStatus });
            throw new functions.https.HttpsError('failed-precondition', 'Token cannot be cancelled right now.');
        }
        const syntheticContext = {
            auth: { uid: `patient-self:${patientId}` }
        };
        await updatePatientStatusForCancel({ clinicId, doctorId, queueId, patientId, newStatus: 'cancelled' }, syntheticContext);
        const existingCancellation = (patientData?.cancellation ?? {});
        const cancellationPatch = {
            cancellation: {
                ...existingCancellation,
                cancelledBy: 'patient-self'
            }
        };
        if (!existingCancellation?.cancelledAt) {
            cancellationPatch.cancellation.cancelledAt = firestore_1.FieldValue.serverTimestamp();
        }
        runInBackground('patientCancelToken.recordCancellationMetadata', async () => {
            try {
                await patientRef.set(cancellationPatch, { merge: true });
            }
            catch (patchErr) {
                functions.logger.warn('Failed to record cancellation metadata', patchErr, { clinicId, doctorId, queueId, patientId });
            }
        });
        span.succeed({ status: 'cancelled' });
        return {
            success: true,
            status: 'cancelled',
            message: 'Token cancelled.'
        };
    }
    catch (error) {
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
exports.patientCancelToken = createV2Callable(patientCancelTokenHandler);
const patientRejoinQueueHandler = async (data, _context) => {
    const span = (0, timing_1.startTiming)('patientRejoinQueue', {
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
        const db = firebaseAdmin_1.admin.firestore();
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
        const patientData = patientSnap.data();
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
        const currentStatus = patientData?.status ?? 'waiting';
        if (currentStatus === 'waiting') {
            span.succeed({ status: 'already-waiting' });
            return {
                success: true,
                status: 'waiting',
                message: 'You are already in the queue.'
            };
        }
        if (currentStatus !== 'cancelled') {
            span.fail({ reason: 'status-not-cancelled', status: currentStatus });
            throw new functions.https.HttpsError('failed-precondition', 'Token cannot be rejoined right now.');
        }
        let sanitizedPatient;
        try {
            sanitizedPatient = (0, patient_1.sanitizePatientInput)({
                name: patientData?.name,
                age: patientData?.age,
                phone: patientData?.phone
            }, { requirePhone: true });
        }
        catch (error) {
            const reason = error instanceof patient_1.PatientValidationError ? error.code : 'invalid-patient';
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
        }, {});
        const existingCancellation = (patientData?.cancellation ?? {});
        const cancellationPatch = {
            cancellation: {
                ...existingCancellation,
                rejoinedAt: firestore_1.FieldValue.serverTimestamp(),
                rejoinedPatientId: joinResult.patientId,
                rejoinedQueueId: joinResult.queueId
            }
        };
        if (!existingCancellation?.cancelledAt) {
            cancellationPatch.cancellation.cancelledAt = firestore_1.FieldValue.serverTimestamp();
        }
        try {
            await patientRef.set(cancellationPatch, { merge: true });
        }
        catch (patchErr) {
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
        };
    }
    catch (error) {
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
exports.patientRejoinQueue = createV2Callable(patientRejoinQueueHandler);
exports.__test__ = {
    patientCancelTokenHandler,
    setUpdatePatientStatusForCancel(delegate) {
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
const createStatusUpdateHandler = (targetStatus) => async (data, context) => {
    return updatePatientStatusHandler({ ...data, newStatus: targetStatus }, context);
};
exports.callPatient = createV2Callable(createStatusUpdateHandler('in-progress'), { memory: criticalMemory, cpu: criticalCpu });
exports.completePatient = createV2Callable(createStatusUpdateHandler('completed'), { memory: criticalMemory, cpu: criticalCpu });
exports.cancelPatient = createV2Callable(createStatusUpdateHandler('cancelled'));
exports.uncallPatient = createV2Callable(createStatusUpdateHandler('waiting'));
const advanceQueueHandler = async (data, context) => {
    const span = (0, timing_1.startTiming)('advanceQueue', {
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
        const db = firebaseAdmin_1.admin.firestore();
        const queueRef = db.collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        const queueSnap = await queueRef.get();
        if (!queueSnap.exists) {
            span.fail({ reason: 'not-found' });
            throw new functions.https.HttpsError('not-found', 'Queue document not found.');
        }
        const queueData = queueSnap.data();
        if (queueData?.status === 'paused' || queueData?.status === 'ended' || queueData?.status === 'closed') {
            span.fail({ reason: 'failed-precondition', status: queueData.status ?? null });
            throw new functions.https.HttpsError('failed-precondition', 'Queue is not active.');
        }
        const patientsCollection = queueRef.collection('patients');
        let completedPatientId = null;
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
        let promotedPatientId = null;
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
    }
    catch (error) {
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
exports.advanceQueue = createV2Callable(advanceQueueHandler);
/**
 * Firebase Callable Function to update a queue's status
 * Requires authentication and allows clinic staff to control queue state
 *
 * @param data - Object containing clinicId, doctorId, queueId, and newStatus
 * @param context - Firebase functions context with authentication info
 * @returns Promise with success message and updated queue data
 */
const updateQueueStatusHandler = async (data, _context) => {
    const span = (0, timing_1.startTiming)('updateQueueStatus', {
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
        const { clinicId: rawClinicId, doctorId: rawDoctorId, queueId: rawQueueId, newStatus } = data;
        if (!rawClinicId || !rawDoctorId || !rawQueueId || !newStatus) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: clinicId, doctorId, queueId, and newStatus are required.');
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
            throw new functions.https.HttpsError('invalid-argument', `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
        await ensureStaffAccess(_context, {
            clinicId,
            doctorId,
            action: 'update queue status'
        });
        // Define database reference
        const db = firebaseAdmin_1.admin.firestore();
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
            uid: _context.auth.uid
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
};
exports.updateQueueStatus = createV2Callable(updateQueueStatusHandler);
/**
 * Toggle or set queue autoAdvance flag.
 * data: { clinicId, doctorId, queueId, enabled }
 */
const setQueueAutoAdvanceHandler = async (data, _context) => {
    const span = (0, timing_1.startTiming)('setQueueAutoAdvance', {
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
        const ref = firebaseAdmin_1.admin.firestore().collection('clinics').doc(clinicId)
            .collection('doctors').doc(doctorId)
            .collection('queues').doc(queueId);
        await ref.set({ autoAdvance: enabled }, { merge: true });
        functions.logger.info('AutoAdvance flag updated', { clinicId, doctorId, queueId, enabled, uid: _context.auth.uid });
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
};
exports.setQueueAutoAdvance = createV2Callable(setQueueAutoAdvanceHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
const setRealTimeStatusHandler = async (data, context) => {
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
        const result = await (0, mutations_1.setDoctorRealTimeStatus)({
            clinicId,
            doctorId,
            online: data.online,
            note: data?.note,
            source: data?.source
        });
        const transitionedToOnline = result.changed &&
            result.previousStatus?.online === false &&
            result.updatedStatus.online === true;
        if (transitionedToOnline) {
            runInBackground('doctorOnlineNotificationDispatch', async () => {
                await (0, notificationQueue_1.dispatchDoctorOnlineNotifications)({ clinicId, doctorId });
            });
        }
        return {
            success: true,
            changed: result.changed,
            previousStatus: result.previousStatus,
            updatedStatus: result.updatedStatus,
            effectiveAt: new Date().toISOString()
        };
    }
    catch (error) {
        mapSchedulingError(error, 'set real-time status');
    }
};
exports.setDoctorRealTimeStatus = createV2Callable(setRealTimeStatusHandler);
const getClinicDoctorAvailabilityHandler = async (data, _context) => {
    const span = (0, timing_1.startTiming)('getClinicDoctorAvailability', {
        clinicId: data?.clinicId ?? null,
        requestedCount: Array.isArray(data?.doctorIds) ? data.doctorIds.length : 0
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
                .filter((value) => typeof value === 'string')
            : [];
        if (providedDoctorIds && sanitizedDoctorIds.length === 0) {
            span.fail({ reason: 'invalid-doctor-ids' });
            spanClosed = true;
            throw new functions.https.HttpsError('invalid-argument', 'doctorIds must contain valid Firestore identifiers');
        }
        const uniqueDoctorIds = Array.from(new Set(sanitizedDoctorIds));
        const db = firebaseAdmin_1.admin.firestore();
        const clinicRef = db.collection('clinics').doc(clinicId);
        const clinicSnap = await clinicRef.get();
        if (!clinicSnap.exists) {
            span.fail({ reason: 'clinic-not-found' });
            spanClosed = true;
            throw new functions.https.HttpsError('not-found', 'Clinic not found');
        }
        const pickString = (value) => {
            if (typeof value !== 'string') {
                return null;
            }
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        };
        const clinicSnapshotData = (clinicSnap.data() ?? {});
        const clinicSummary = {
            name: pickString(clinicSnapshotData['name']),
            address: pickString(clinicSnapshotData['address']),
            phone: pickString(clinicSnapshotData['phone'])
        };
        const clinicInfo = clinicSummary.name || clinicSummary.address || clinicSummary.phone ? clinicSummary : null;
        const doctorsCollection = clinicRef.collection('doctors');
        const doctorMetadata = new Map();
        const extractDoctorProfile = (raw) => {
            if (!raw) {
                return null;
            }
            const name = typeof raw['name'] === 'string' ? raw['name'] : null;
            const specialty = typeof raw['specialty'] === 'string' ? raw['specialty'] : null;
            const avatarUrl = typeof raw['photoUrl'] === 'string' ? raw['photoUrl'] : null;
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
            await Promise.all(targetDoctorIds.map(async (doctorId) => {
                const snap = await doctorsCollection.doc(doctorId).get();
                if (snap.exists) {
                    doctorMetadata.set(doctorId, snap.data() ?? {});
                }
                else {
                    doctorMetadata.set(doctorId, null);
                }
            }));
        }
        else {
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
        const availabilityResults = await (0, availability_1.resolveManyDoctorAvailability)({
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
    }
    catch (error) {
        if (!spanClosed) {
            span.fail({ error: error instanceof Error ? error.message : String(error) });
            spanClosed = true;
        }
        throw error;
    }
};
exports.getClinicDoctorAvailability = createV2Callable(getClinicDoctorAvailabilityHandler, { memory: criticalMemory, cpu: criticalCpu });
const getClinicSchedulingSettingsHandler = async (data, _context) => {
    const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
    const clinicId = clinicResolution.clinicId;
    if (clinicResolution.shareCode) {
        functions.logger.debug('getClinicSchedulingSettings clinic resolved via share code', {
            requestedClinicId: clinicResolution.requestedId,
            clinicId,
            shareCode: clinicResolution.shareCode
        });
    }
    const settings = await (0, settings_1.loadClinicSchedulingSettings)(clinicId);
    return {
        clinicId,
        settings
    };
};
exports.getClinicSchedulingSettings = createV2Callable(getClinicSchedulingSettingsHandler);
const updateClinicSchedulingSettingsHandler = async (data, context) => {
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
    const settings = await (0, settings_1.saveClinicSchedulingSettings)(clinicId, {
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
exports.updateClinicSchedulingSettings = createV2Callable(updateClinicSchedulingSettingsHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
const baseRequestDoctorOnlineNotificationHandler = (0, requestDoctorOnlineNotification_1.createRequestDoctorOnlineNotificationHandler)();
const requestDoctorOnlineNotificationHandler = async (data, context) => {
    const clinicResolution = await resolveClinicIdentifier(data?.clinicId);
    const canonicalClinicId = clinicResolution.clinicId;
    if (clinicResolution.shareCode) {
        functions.logger.debug('requestDoctorOnlineNotification clinic resolved via share code', {
            requestedClinicId: clinicResolution.requestedId,
            clinicId: canonicalClinicId,
            shareCode: clinicResolution.shareCode
        });
    }
    return baseRequestDoctorOnlineNotificationHandler({
        ...data,
        clinicId: canonicalClinicId
    }, context);
};
exports.requestDoctorOnlineNotification = createV2Callable(requestDoctorOnlineNotificationHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
const updateDefaultRotaHandler = async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const rawClinicId = typeof data?.clinicId === 'string' ? data.clinicId : '';
    const rawDoctorId = typeof data?.doctorId === 'string' ? data.doctorId : '';
    const timeZone = typeof data?.timeZone === 'string' ? data.timeZone.trim() : '';
    const week = data?.week ?? {};
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
        const rota = await (0, mutations_1.updateDoctorDefaultRota)({
            clinicId,
            doctorId,
            timeZone,
            week
        });
        return {
            success: true,
            rota
        };
    }
    catch (error) {
        mapSchedulingError(error, 'update default rota');
    }
};
exports.updateDoctorDefaultRota = createV2Callable(updateDefaultRotaHandler);
const createOverrideHandler = async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const payload = {
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
        const result = await (0, mutations_1.createDoctorScheduleOverride)(payload);
        return {
            success: true,
            overrideId: result.id,
            override: result.override
        };
    }
    catch (error) {
        mapSchedulingError(error, 'create schedule override');
    }
};
exports.createDoctorScheduleOverride = createV2Callable(createOverrideHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
const updateOverrideHandler = async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const payload = {
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
        const result = await (0, mutations_1.updateDoctorScheduleOverride)(payload);
        return {
            success: true,
            overrideId: result.id,
            override: result.override
        };
    }
    catch (error) {
        mapSchedulingError(error, 'update schedule override');
    }
};
exports.updateDoctorScheduleOverride = createV2Callable(updateOverrideHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
const deleteOverrideHandler = async (data, context) => {
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
        const result = await (0, mutations_1.deleteDoctorScheduleOverride)({ clinicId, doctorId, overrideId });
        return { success: result.deleted };
    }
    catch (error) {
        mapSchedulingError(error, 'delete schedule override');
    }
};
exports.deleteDoctorScheduleOverride = createV2Callable(deleteOverrideHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
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
const bootstrapClinicAccountHandler = async (data, _context) => {
    try {
        if (!_context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }
        const authUid = _context.auth.uid; // safe after guard
        const authEmail = _context.auth.token?.email || null;
        const { clinicName, doctorName, specialty, clinicId: providedClinicId, doctorId: providedDoctorId, clinicPhone } = data || {};
        if (!clinicName || !doctorName || !specialty) {
            throw new functions.https.HttpsError('invalid-argument', 'clinicName, doctorName, specialty are required');
        }
        const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'id';
        const clinicId = providedClinicId ? String(providedClinicId) : slugify(clinicName);
        const doctorId = providedDoctorId ? String(providedDoctorId) : slugify(doctorName);
        const today = new Date().toISOString().split('T')[0];
        const db = firebaseAdmin_1.admin.firestore();
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
        const shareCode = await ensureClinicShareCode(clinicId);
        await clinicRef.set({
            shareCode,
            shareCodeStatus: 'active',
            shareCodeAssignedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        functions.logger.info('bootstrapClinicAccount complete', { clinicId, doctorId, shareCode, uid: authUid });
        return { success: true, clinicId, clinicShareCode: shareCode, doctorId, queueId: today };
    }
    catch (err) {
        functions.logger.error('bootstrapClinicAccount error', err);
        if (err instanceof functions.https.HttpsError)
            throw err;
        throw new functions.https.HttpsError('internal', 'Failed to bootstrap clinic account');
    }
};
exports.bootstrapClinicAccount = createV2Callable(bootstrapClinicAccountHandler, { memory: lessFrequentMemory, cpu: lessFrequentCpu });
//# sourceMappingURL=index.js.map