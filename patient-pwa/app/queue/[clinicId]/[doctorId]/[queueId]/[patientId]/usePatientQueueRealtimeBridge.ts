'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type FirebaseError } from 'firebase/app';
import {
    doc,
    onSnapshot,
    type DocumentData,
    type DocumentSnapshot
} from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { anonymizeId, trackAnalyticsEvent } from '../../../../../../lib/analytics';
import { db } from '../../../../../../lib/firebase';

type PatientStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled';

type QueueStatus = 'active' | 'paused' | 'ended';

type FirestoreTimestamp = Date | { seconds: number; nanoseconds: number } | null | undefined;

export interface Patient {
  id: string;
  name: string;
  age: number;
  phone: string;
  tokenNumber: number;
  status: PatientStatus;
  joinedAt: FirestoreTimestamp;
  queueId: string;
  clinicId: string;
  doctorId: string;
}

export interface Queue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: QueueStatus;
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinicId: string;
  email?: string;
  phone?: string;
}

interface UsePatientQueueBridgeOptions {
  enabled: boolean;
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  patientId?: string;
  patientFallback?: Patient | null;
  queryKeys: {
    patient: readonly unknown[];
    queue: readonly unknown[];
    doctor: readonly unknown[];
  };
  onRealtimeError?: (value: string | null) => void;
  refreshSession?: () => Promise<RefreshSessionResult>;
  onRequireRelogin?: (payload?: { message?: string }) => void;
}

export interface RefreshSessionResult {
  ok: boolean;
  message?: string;
}

type ListenerName = 'patient' | 'queue' | 'doctor';

interface ListenerController {
  attempts: number;
  unsubscribe?: () => void;
  timer?: ReturnType<typeof setTimeout> | null;
}

interface FirestoreErrorClassification {
  code: string | null;
  kind: 'auth' | 'transient' | 'fatal' | 'unknown';
  message: string;
}

const TRANSIENT_ERROR_CODES = new Set([
  'aborted',
  'cancelled',
  'deadline-exceeded',
  'internal',
  'resource-exhausted',
  'unavailable'
]);

const AUTH_ERROR_CODES = new Set(['permission-denied', 'unauthenticated']);

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_SILENT_AUTH_RETRIES = 3;

export function usePatientQueueRealtimeBridge({
  enabled,
  clinicId,
  doctorId,
  queueId,
  patientId,
  patientFallback,
  queryKeys,
  onRealtimeError,
  refreshSession,
  onRequireRelogin,
}: UsePatientQueueBridgeOptions) {
  const queryClient = useQueryClient();
  const previousQueueRef = useRef<Queue | null>(null);
  const previousPatientStatusRef = useRef<PatientStatus | null>(null);
  const patientFallbackRef = useRef<Patient | null>(patientFallback ?? null);

  useEffect(() => {
    patientFallbackRef.current = patientFallback ?? null;
  }, [patientFallback]);

  useEffect(() => {
    previousQueueRef.current = null;
    previousPatientStatusRef.current = null;
    if (!enabled || !clinicId || !doctorId || !queueId || !patientId) {
      return;
    }

    let cancelled = false;
    const reportError = onRealtimeError ?? (() => {});
    const authState = {
      attempts: 0,
      inFlight: null as Promise<void> | null,
    };

    reportError(null);

    const patientRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId, 'patients', patientId);
    const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId);
    const doctorRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);

    const listeners: Record<ListenerName, ListenerController> = {
      patient: { attempts: 0 },
      queue: { attempts: 0 },
      doctor: { attempts: 0 },
    };

    const cleanupListener = (name: ListenerName) => {
      const controller = listeners[name];
      if (!controller) {
        return;
      }
      if (controller.timer) {
        clearTimeout(controller.timer);
        controller.timer = null;
      }
      if (controller.unsubscribe) {
        try {
          controller.unsubscribe();
        } catch {
          // ignore cleanup failures
        }
        controller.unsubscribe = undefined;
      }
    };

    const cleanupAll = () => {
      (Object.keys(listeners) as ListenerName[]).forEach((name) => cleanupListener(name));
    };

    const scheduleRetry = (name: ListenerName, options?: { immediate?: boolean; resetAttempts?: boolean }) => {
      const controller = listeners[name];
      if (!controller || cancelled) {
        return;
      }

      if (controller.timer) {
        clearTimeout(controller.timer);
        controller.timer = null;
      }

      if (options?.resetAttempts) {
        controller.attempts = 0;
      }

      if (!options?.immediate) {
        controller.attempts += 1;
      }

      const delay = options?.immediate ? 0 : getRetryDelayForAttempt(controller.attempts);

      controller.timer = setTimeout(() => {
        controller.timer = null;
        if (cancelled) {
          return;
        }
        subscribeFns[name]();
      }, delay);
    };

    const updatePatientCacheFromSnapshot = (snapshot: DocumentSnapshot<DocumentData>) => {
      queryClient.setQueryData<Patient | undefined>(queryKeys.patient, (prev) => {
        const existing: Patient | null = prev ?? patientFallbackRef.current ?? null;
        const fallbackPatient: Patient = existing ?? {
          id: snapshot.id,
          name: '',
          age: 0,
          phone: '',
          tokenNumber: 0,
          status: 'waiting',
          joinedAt: null,
          queueId: typeof queueId === 'string' ? queueId : '',
          clinicId: typeof clinicId === 'string' ? clinicId : '',
          doctorId: typeof doctorId === 'string' ? doctorId : '',
        };

        return buildPatientFromSnapshot(snapshot, fallbackPatient);
      });
    };

    const handleAuthFailure = (message?: string) => {
      if (cancelled) {
        return;
      }
      const fallbackMessage = message ?? 'Your session expired. Please sign back in to continue.';
      reportError(fallbackMessage);
      onRequireRelogin?.({ message: fallbackMessage });
    };

    const handleListenerError = async (name: ListenerName, error: unknown) => {
      if (cancelled) {
        return;
      }

      cleanupListener(name);

      if (process.env.NODE_ENV === 'development') {
        console.warn(`Realtime listener '${name}' error:`, error);
      }

      const classification = classifyFirestoreError(error);

      if (classification.kind === 'auth') {
        const safeRefresh = refreshSession;
        if (!safeRefresh) {
          handleAuthFailure(classification.message);
          return;
        }

        if (authState.inFlight) {
          // Another listener already triggered a refresh; just wait for it.
          return;
        }

        if (authState.attempts >= MAX_SILENT_AUTH_RETRIES) {
          handleAuthFailure(classification.message);
          return;
        }

        authState.attempts += 1;
        reportError('Re-authenticating your session…');

        authState.inFlight = safeRefresh()
          .then((result) => {
            authState.inFlight = null;
            if (cancelled) {
              return;
            }

            if (result.ok) {
              authState.attempts = 0;
              reportError(null);
              scheduleRetry(name, { immediate: true, resetAttempts: true });
            } else if (authState.attempts >= MAX_SILENT_AUTH_RETRIES) {
              handleAuthFailure(result.message ?? classification.message);
            } else {
              reportError(result.message ?? classification.message);
              scheduleRetry(name, { resetAttempts: false });
            }
          })
          .catch((refreshErr) => {
            authState.inFlight = null;
            if (cancelled) {
              return;
            }
            const fallbackMessage = refreshErr instanceof Error ? refreshErr.message : classification.message;
            if (authState.attempts >= MAX_SILENT_AUTH_RETRIES) {
              handleAuthFailure(fallbackMessage);
            } else {
              reportError(fallbackMessage);
              scheduleRetry(name);
            }
          });

        return;
      }

      if (classification.kind === 'transient') {
        reportError(classification.message);
        scheduleRetry(name);
        return;
      }

      if (classification.kind === 'fatal') {
        reportError(classification.message);
        return;
      }

      reportError(classification.message);
      scheduleRetry(name);
    };

    const subscribePatient = () => {
      if (cancelled) {
        return;
      }

      cleanupListener('patient');

      const unsubscribe = onSnapshot(
        patientRef,
        (snapshot) => {
          if (cancelled) {
            return;
          }

          if (!snapshot.exists()) {
            reportError('Patient document not found');
            return;
          }

          reportError(null);
          listeners.patient.attempts = 0;
          updatePatientCacheFromSnapshot(snapshot);

          const nextPatient = buildPatientFromSnapshot(snapshot, {
            id: snapshot.id,
            name: '',
            age: 0,
            phone: '',
            tokenNumber: 0,
            status: 'waiting',
            joinedAt: null,
            queueId,
            clinicId,
            doctorId,
          });

          const previousStatus = previousPatientStatusRef.current;
          if (previousStatus && previousStatus !== nextPatient.status) {
            trackAnalyticsEvent('status_updated', {
              clinic_id: clinicId,
              doctor_id: doctorId,
              queue_id: queueId,
              new_status: nextPatient.status,
              previous_status: previousStatus,
              patient_hint: anonymizeId(patientId),
              source: 'patient_pwa_realtime'
            });
          }
          previousPatientStatusRef.current = nextPatient.status;
        },
        (error) => {
          void handleListenerError('patient', error);
        }
      );

      listeners.patient.unsubscribe = () => {
        try {
          unsubscribe();
        } catch {
          // ignore cleanup failures
        }
      };
    };

    const subscribeQueue = () => {
      if (cancelled) {
        return;
      }

      cleanupListener('queue');

      const unsubscribe = onSnapshot(
        queueRef,
        (snapshot) => {
          if (cancelled) {
            return;
          }

          if (!snapshot.exists()) {
            reportError('Queue document not found');
            return;
          }

          reportError(null);
          listeners.queue.attempts = 0;
          queryClient.setQueryData<Queue | undefined>(queryKeys.queue, () =>
            buildQueueFromSnapshot(snapshot, { clinicId, doctorId })
          );

          const currentQueue = buildQueueFromSnapshot(snapshot, { clinicId, doctorId });
          const previousQueue = previousQueueRef.current;
          if (previousQueue) {
            if (currentQueue.status !== previousQueue.status || currentQueue.currentToken !== previousQueue.currentToken) {
              trackAnalyticsEvent('queue_state_updated', {
                clinic_id: clinicId,
                doctor_id: doctorId,
                queue_id: queueId,
                new_status: currentQueue.status,
                previous_status: previousQueue.status,
                current_token: currentQueue.currentToken,
                previous_token: previousQueue.currentToken,
                source: 'patient_pwa_realtime'
              });
            }
          }
          previousQueueRef.current = currentQueue;
        },
        (error) => {
          void handleListenerError('queue', error);
        }
      );

      listeners.queue.unsubscribe = () => {
        try {
          unsubscribe();
        } catch {
          // ignore cleanup failures
        }
      };
    };

    const subscribeDoctor = () => {
      if (cancelled) {
        return;
      }

      cleanupListener('doctor');

      const unsubscribe = onSnapshot(
        doctorRef,
        (snapshot) => {
          if (cancelled) {
            return;
          }

          if (!snapshot.exists()) {
            reportError('Doctor document not found');
            return;
          }

          reportError(null);
          listeners.doctor.attempts = 0;
          queryClient.setQueryData<Doctor | undefined>(queryKeys.doctor, () =>
            buildDoctorFromSnapshot(snapshot, { clinicId })
          );
        },
        (error) => {
          void handleListenerError('doctor', error);
        }
      );

      listeners.doctor.unsubscribe = () => {
        try {
          unsubscribe();
        } catch {
          // ignore cleanup failures
        }
      };
    };

    const subscribeFns: Record<ListenerName, () => void> = {
      patient: subscribePatient,
      queue: subscribeQueue,
      doctor: subscribeDoctor,
    };

    subscribePatient();
    subscribeQueue();
    subscribeDoctor();

    return () => {
      cancelled = true;
      cleanupAll();
      if (authState.inFlight) {
        authState.inFlight = null;
      }
    };
  }, [
    enabled,
    clinicId,
    doctorId,
    queueId,
    patientId,
    queryClient,
    queryKeys.patient,
    queryKeys.queue,
    queryKeys.doctor,
    onRealtimeError,
    refreshSession,
    onRequireRelogin,
  ]);
}

export function getRetryDelayForAttempt(attempt: number): number {
  if (attempt <= 0) {
    return BASE_RETRY_DELAY_MS;
  }
  const exponential = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  return Math.min(exponential, MAX_RETRY_DELAY_MS);
}

export function classifyFirestoreError(error: unknown): FirestoreErrorClassification {
  const firebaseError = extractFirebaseError(error);
  const code = firebaseError?.code ?? null;

  if (code && AUTH_ERROR_CODES.has(code)) {
    return {
      code,
      kind: 'auth',
      message: 'Your session expired. Attempting to re-authenticate…',
    };
  }

  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return {
      code,
      kind: 'transient',
      message: 'Realtime connection interrupted. Retrying…',
    };
  }

  if (firebaseError) {
    const sanitized = firebaseError.message.replace(/^FirebaseError:\s*/i, '').trim();
    return {
      code,
      kind: 'fatal',
      message: sanitized || 'Realtime listener failed.',
    };
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return {
    code: null,
    kind: 'unknown',
    message: message || 'Realtime listener failed.',
  };
}

function extractFirebaseError(error: unknown): FirebaseError | null {
  if (!error) {
    return null;
  }
  if (typeof error === 'object' && 'code' in error && 'message' in error) {
    return error as FirebaseError;
  }
  return null;
}

export function buildPatientFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  fallback: Patient
): Patient {
  const raw = snapshot.data() as DocumentData;
  return {
    id: snapshot.id,
    name: typeof raw.name === 'string' ? raw.name : fallback.name,
    age: typeof raw.age === 'number' ? raw.age : fallback.age,
    phone: typeof raw.phone === 'string' ? raw.phone : fallback.phone,
    tokenNumber: typeof raw.tokenNumber === 'number' ? raw.tokenNumber : fallback.tokenNumber,
    status: (raw.status as PatientStatus) ?? fallback.status,
    joinedAt: (raw.joinedAt as FirestoreTimestamp) ?? fallback.joinedAt,
    queueId: typeof raw.queueId === 'string' ? raw.queueId : fallback.queueId,
    clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : fallback.clinicId,
    doctorId: typeof raw.doctorId === 'string' ? raw.doctorId : fallback.doctorId,
  };
}

export function buildQueueFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  defaults: { clinicId: string; doctorId: string }
): Queue {
  const raw = snapshot.data() as DocumentData;
  return {
    id: snapshot.id,
    doctorId: typeof raw.doctorId === 'string' ? raw.doctorId : defaults.doctorId,
    clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : defaults.clinicId,
    status: (raw.status as QueueStatus) ?? 'active',
    currentToken: typeof raw.currentToken === 'number' ? raw.currentToken : 0,
    totalPatients: typeof raw.totalPatients === 'number' ? raw.totalPatients : 0,
    completedPatients: typeof raw.completedPatients === 'number' ? raw.completedPatients : 0,
    createdAt: (raw.createdAt as FirestoreTimestamp) ?? undefined,
    updatedAt: (raw.updatedAt as FirestoreTimestamp) ?? undefined,
  };
}

export function buildDoctorFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  defaults: { clinicId: string }
): Doctor {
  const raw = snapshot.data() as DocumentData;
  return {
    id: snapshot.id,
    name: typeof raw.name === 'string' ? raw.name : 'Doctor',
    specialty: typeof raw.specialty === 'string' ? raw.specialty : 'General Practice',
    clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : defaults.clinicId,
    email: typeof raw.email === 'string' ? raw.email : undefined,
    phone: typeof raw.phone === 'string' ? raw.phone : undefined,
  };
}
