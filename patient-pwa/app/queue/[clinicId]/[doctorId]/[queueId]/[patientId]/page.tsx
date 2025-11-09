"use client";

export const dynamic = "force-dynamic";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRejoinQueue } from '@/lib/hooks/use-join-queue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { auth, db, functions } from '../../../../../../lib/firebase';
import { derivePatientStatusFromQueue } from './patientStatusDerivation';
import { buildRejoinRedirectUrl } from './rejoinUtils';
import { buildSessionDeps, establishPatientSession, type EstablishSessionDeps } from './session';
import {
  buildDoctorFromSnapshot,
  buildQueueFromSnapshot,
  usePatientQueueRealtimeBridge,
  type Doctor,
  type Patient,
  type Queue
} from './usePatientQueueRealtimeBridge';

interface PatientCancelTokenPayload {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  token: string;
}

interface PatientCancelTokenResult {
  success: boolean;
  status: Patient['status'];
  alreadyCancelled?: boolean;
  message?: string;
}

interface GetPatientViewPayload {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  token: string;
}

interface GetPatientViewResult {
  patient?: Patient;
}

export default function QueueStatus() {
  const params = useParams<{ clinicId: string; doctorId: string; queueId: string; patientId: string }>();
  const rejoinQueueMutation = useRejoinQueue();
  const router = useRouter();
  const clinicId = params?.clinicId;
  const doctorId = params?.doctorId;
  const queueId = params?.queueId;
  const patientId = params?.patientId;
  const hasRequiredParams = Boolean(clinicId && doctorId && queueId && patientId);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'cancelling' | 'rejoining'>('idle');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [optimisticPatientStatus, setOptimisticPatientStatus] = useState<Patient['status'] | null>(null);
  const [requiresRelogin, setRequiresRelogin] = useState(false);
  const [sessionRetryPending, setSessionRetryPending] = useState(false);
  const sessionDepsRef = useRef<EstablishSessionDeps>(buildSessionDeps(functions, auth));

  const refreshSession = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!hasRequiredParams || typeof window === 'undefined') {
      return { ok: false, message: 'Missing queue information.' } as const;
    }

    const context = {
      locationHref: window.location.href,
      replaceUrl: (cleaned: string) => window.history.replaceState({}, '', cleaned),
      storage: window.sessionStorage
    };

    const deps = sessionDepsRef.current;

    try {
      const token = await establishPatientSession(
        { clinicId: clinicId!, doctorId: doctorId!, queueId: queueId!, patientId: patientId! },
        context,
        deps
      );

      setAccessToken(token);
      setSessionReady(true);
      setSessionError(null);
      setRequiresRelogin(false);
      if (silent) {
        // preserve existing realtime error messaging; listeners will clear when they recover
      } else {
        setRealtimeError(null);
      }

      return { ok: true } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh session';

      if (!silent) {
        setSessionError(message);
        setSessionReady(false);
        setAccessToken(null);
      }

      return { ok: false, message } as const;
    }
  }, [clinicId, doctorId, hasRequiredParams, patientId, queueId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!hasRequiredParams) {
      setSessionError('Missing required parameters in URL');
      setRealtimeError(null);
      setSessionReady(false);
      setAccessToken(null);
      setRequiresRelogin(false);
      return;
    }

    let cancelled = false;
    setSessionReady(false);
    setAccessToken(null);
    setSessionError(null);
    setRealtimeError(null);
    setRequiresRelogin(false);

    (async () => {
      const result = await refreshSession({ silent: false });
      if (!cancelled && !result.ok) {
        console.error('Failed to establish patient session', result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasRequiredParams, refreshSession]);

  const queryClient = useQueryClient();
  const patientQueryKey = useMemo(
    () => ['patient-view', clinicId ?? '', doctorId ?? '', queueId ?? '', patientId ?? ''] as const,
    [clinicId, doctorId, queueId, patientId]
  );
  const queueQueryKey = useMemo(
    () => ['queue', clinicId ?? '', doctorId ?? '', queueId ?? ''] as const,
    [clinicId, doctorId, queueId]
  );
  const doctorQueryKey = useMemo(
    () => ['doctor', clinicId ?? '', doctorId ?? ''] as const,
    [clinicId, doctorId]
  );

  useEffect(() => {
    if (typeof document === 'undefined' || !hasRequiredParams) {
      return;
    }

    let lastHiddenAt: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
        return;
      }

      if (document.visibilityState !== 'visible') {
        return;
      }

      const hiddenDuration = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
      lastHiddenAt = null;

      if (!sessionReady || requiresRelogin || !accessToken) {
        return;
      }

      if (hiddenDuration > 60_000) {
        void refreshSession({ silent: true });
      }

      queryClient.invalidateQueries({ queryKey: patientQueryKey, exact: true });
      queryClient.invalidateQueries({ queryKey: queueQueryKey, exact: true });
      queryClient.invalidateQueries({ queryKey: doctorQueryKey, exact: true });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    accessToken,
    doctorQueryKey,
    hasRequiredParams,
    patientQueryKey,
    queueQueryKey,
    queryClient,
    refreshSession,
    requiresRelogin,
    sessionReady,
  ]);

  const initialPatientRef = useRef<Patient | undefined>(undefined);
  const initialQueueRef = useRef<Queue | undefined>(undefined);
  const initialDoctorRef = useRef<Doctor | undefined>(undefined);
  const initialKeyRef = useRef({ patient: '', queue: '', doctor: '' });

  if (hasRequiredParams) {
    const patientKeyHash = patientQueryKey.join('|');
    if (initialKeyRef.current.patient !== patientKeyHash) {
      initialKeyRef.current.patient = patientKeyHash;
      initialPatientRef.current = queryClient.getQueryData<Patient>(patientQueryKey) ?? undefined;
    }

    const queueKeyHash = queueQueryKey.join('|');
    if (initialKeyRef.current.queue !== queueKeyHash) {
      initialKeyRef.current.queue = queueKeyHash;
      initialQueueRef.current = queryClient.getQueryData<Queue>(queueQueryKey) ?? undefined;
    }

    const doctorKeyHash = doctorQueryKey.join('|');
    if (initialKeyRef.current.doctor !== doctorKeyHash) {
      initialKeyRef.current.doctor = doctorKeyHash;
      initialDoctorRef.current = queryClient.getQueryData<Doctor>(doctorQueryKey) ?? undefined;
    }
  }

  const hasOptimisticCache = Boolean(initialPatientRef.current);

  const queriesEnabled = sessionReady && !!accessToken && hasRequiredParams && !requiresRelogin;

  const patientViewQuery = useQuery<Patient>({
    queryKey: patientQueryKey,
    enabled: queriesEnabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    ...(initialPatientRef.current ? { initialData: initialPatientRef.current } : {}),
    queryFn: async () => {
      const getViewFn = httpsCallable<GetPatientViewPayload, GetPatientViewResult>(functions, 'getPatientView');
      const { data } = await getViewFn({
        clinicId: clinicId!,
        doctorId: doctorId!,
        queueId: queueId!,
        patientId: patientId!,
        token: accessToken!
      });

      if (!data?.patient) {
        throw new Error('Failed to fetch patient data');
      }

      return data.patient;
    },
  });

  const queueQuery = useQuery<Queue>({
    queryKey: queueQueryKey,
    enabled: queriesEnabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    ...(initialQueueRef.current ? { initialData: initialQueueRef.current } : {}),
    queryFn: async () => {
      const queueRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!, 'queues', queueId!);
      const snapshot = await getDoc(queueRef);

      if (!snapshot.exists()) {
        throw new Error('Queue document not found');
      }

      return buildQueueFromSnapshot(snapshot, { clinicId: clinicId!, doctorId: doctorId! });
    },
  });

  const doctorQuery = useQuery<Doctor>({
    queryKey: doctorQueryKey,
    enabled: queriesEnabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    ...(initialDoctorRef.current ? { initialData: initialDoctorRef.current } : {}),
    queryFn: async () => {
      const doctorRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!);
      const snapshot = await getDoc(doctorRef);

      if (!snapshot.exists()) {
        throw new Error('Doctor document not found');
      }

      return buildDoctorFromSnapshot(snapshot, { clinicId: clinicId! });
    },
  });

  usePatientQueueRealtimeBridge({
    enabled: queriesEnabled,
    clinicId,
    doctorId,
    queueId,
    patientId,
    patientFallback: patientViewQuery.data ?? initialPatientRef.current ?? null,
    queryKeys: {
      patient: patientQueryKey,
      queue: queueQueryKey,
      doctor: doctorQueryKey,
    },
    onRealtimeError: setRealtimeError,
    refreshSession: () => refreshSession({ silent: true }),
    onRequireRelogin: (payload) => {
      const message = payload?.message ?? 'Your session expired. Please sign in again to continue.';
      setRequiresRelogin(true);
      setSessionReady(false);
      setAccessToken(null);
      setSessionError(message);
    },
  });

  const patient = patientViewQuery.data ?? null;
  const queue = queueQuery.data ?? null;
  const doctor = doctorQuery.data ?? null;

  useEffect(() => {
    if (!patient) {
      setOptimisticPatientStatus(null);
      return;
    }

    if (optimisticPatientStatus && patient.status === optimisticPatientStatus) {
      setOptimisticPatientStatus(null);
    }
  }, [patient, patient?.status, optimisticPatientStatus]);

  const derivedPatientStatus = useMemo(
    () => derivePatientStatusFromQueue(patient, queue),
    [patient, queue]
  );

  const patientStatus = useMemo(() => {
    if (optimisticPatientStatus) {
      return optimisticPatientStatus;
    }

    const actualStatus = patient?.status ?? null;

    if (actualStatus === 'cancelled' || actualStatus === 'completed' || actualStatus === 'in-progress') {
      return actualStatus;
    }

    if (actualStatus === 'waiting') {
      if (derivedPatientStatus === 'completed') {
        return 'completed';
      }
      return 'waiting';
    }

    return derivedPatientStatus ?? actualStatus ?? null;
  }, [derivedPatientStatus, optimisticPatientStatus, patient?.status]);

  const firstQueryError = patientViewQuery.error ?? queueQuery.error ?? doctorQuery.error;
  const queryErrorMessage = firstQueryError
    ? firstQueryError instanceof Error
      ? firstQueryError.message
      : typeof firstQueryError === 'string'
        ? firstQueryError
        : 'Failed to fetch data'
    : null;

  const error = sessionError ?? realtimeError ?? queryErrorMessage;
  const showErrorBanner = Boolean(error && !requiresRelogin);

  const patientPending = patientViewQuery.isPending && patientViewQuery.fetchStatus !== 'idle';
  const queuePending = queueQuery.isPending && queueQuery.fetchStatus !== 'idle';
  const doctorPending = doctorQuery.isPending && doctorQuery.fetchStatus !== 'idle';
  const anyFetching =
    patientViewQuery.fetchStatus === 'fetching' ||
    queueQuery.fetchStatus === 'fetching' ||
    doctorQuery.fetchStatus === 'fetching';

  const isEstablishingSession = !sessionReady && !sessionError;
  const queriesPending = patientPending || queuePending || doctorPending || anyFetching;
  const isLoading = !hasOptimisticCache && (isEstablishingSession || queriesPending);

  const handleCancelToken = async () => {
    if (!clinicId || !doctorId || !queueId || !patientId) {
      setActionError('Missing queue information.');
      return;
    }
    if (!accessToken) {
      setActionError('Missing access token. Please refresh the page.');
      return;
    }
    if (requiresRelogin) {
      setActionError('Your session expired. Please reconnect before cancelling.');
      return;
    }

    setActionError(null);
    setActionState('cancelling');

    try {
      const cancelFn = httpsCallable<PatientCancelTokenPayload, PatientCancelTokenResult>(functions, 'patientCancelToken');
      const { data } = await cancelFn({ clinicId, doctorId, queueId, patientId, token: accessToken });

      if (data?.success) {
        const message = data.alreadyCancelled
          ? 'Your token was already cancelled.'
          : data.message ?? 'Your token has been cancelled.';
        toast.success(message);
        setActionError(null);
        setOptimisticPatientStatus('cancelled');
        queryClient.setQueryData<Patient | undefined>(patientQueryKey, (prev) => {
          if (!prev) {
            return prev;
          }
          return { ...prev, status: 'cancelled' };
        });
        queryClient.invalidateQueries({ queryKey: patientQueryKey, exact: true });
      } else {
        const fallback = data?.message ?? 'Unable to cancel your token. Please try again.';
        setActionError(fallback);
        toast.error(fallback);
      }
    } catch (err) {
      const message = (err as { message?: string })?.message ?? 'Unable to cancel your token. Please try again.';
      setActionError(message);
      toast.error(message);
    } finally {
      setActionState('idle');
      setCancelDialogOpen(false);
    }
  };

  const handleRejoinQueue = () => {
    if (!clinicId || !doctorId || !queueId || !patientId) {
      setActionError('Missing queue information.');
      return;
    }
    if (!accessToken) {
      setActionError('Missing access token. Please refresh the page.');
      return;
    }
    if (requiresRelogin) {
      setActionError('Your session expired. Please reconnect before rejoining.');
      return;
    }

    setActionError(null);
    setActionState('rejoining');

    rejoinQueueMutation.mutate(
      { clinicId, doctorId, queueId, patientId, token: accessToken },
      {
        onSuccess: (data) => {
          if (!data?.success) {
            const fallback = data?.message ?? 'Unable to rejoin the queue. Please try again.';
            setActionError(fallback);
            setActionState('idle');
            return;
          }

          const rejoin = data.rejoin;
          if (rejoin) {
            try {
              if (rejoin.accessToken && rejoin.patientId) {
                sessionStorage.setItem(`patientToken:${rejoin.patientId}`, rejoin.accessToken);
              }
            } catch (storageError) {
              console.warn('Failed to persist rejoin access token', storageError);
            }

            const redirectUrl = buildRejoinRedirectUrl({
              clinicId: rejoin.clinicId,
              doctorId: rejoin.doctorId,
              queueId: rejoin.queueId,
              patientId: rejoin.patientId,
              accessToken: rejoin.accessToken
            });

            setActionState('idle');
            router.replace(redirectUrl);
            return;
          }

          if (data.queueId) {
            // Legacy fallback (same queue/patient)
            setActionState('idle');
            return;
          }

          const fallback = data?.message ?? 'Unable to rejoin the queue. Please try again.';
          setActionError(fallback);
          setActionState('idle');
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Failed to rejoin queue. Please try again.';
          setActionError(message);
          setActionState('idle');
        },
      }
    );
  };

  // Calculate derived values (status-aware)
  let patientsAhead = 0;
  let progressPercentage = 0;
  let nowServingDisplay = queue?.currentToken || 0;
  const lastProgressRef = useRef<number>(0);
  if (patient && queue && patientStatus) {
    switch (patientStatus) {
      case 'completed':
        patientsAhead = 0;
        progressPercentage = 100;
        nowServingDisplay = patient.tokenNumber; // ensures card reflects their token when done
        break;
      case 'in-progress':
        patientsAhead = 0;
        progressPercentage = Math.max(95, Math.min(99, (queue.currentToken / patient.tokenNumber) * 100 || 95));
        nowServingDisplay = patient.tokenNumber; // override to show their token explicitly
        break;
      case 'cancelled':
        patientsAhead = 0;
        // Freeze whatever the last non-cancelled progress was
        progressPercentage = lastProgressRef.current;
        break;
      default: // waiting
        patientsAhead = Math.max(0, patient.tokenNumber - queue.currentToken);
        if (patient.tokenNumber > 0) {
          progressPercentage = Math.min(94, (queue.currentToken / patient.tokenNumber) * 100);
        }
        break;
    }
    // Update lastProgressRef for non-cancelled states
    if (patientStatus !== 'cancelled') {
      lastProgressRef.current = progressPercentage;
    }
  }
  // Estimate wait time (rough calculation: 5 minutes per patient)
  const estimatedWaitTime = patientsAhead > 0 ? `~ ${patientsAhead * 5} minutes` : 'Your turn!';
  // Accessibility: live message
  const liveMessage = (() => {
    if (!patient || !queue || !patientStatus) return '';
    if (patientStatus === 'completed') return 'Your consultation is completed.';
    if (patientStatus === 'cancelled') return 'Your token has been cancelled. If this was unexpected, please contact the clinic team to rejoin.';
    if (patientStatus === 'in-progress') return 'Please proceed. It is your turn now.';
    if (patientsAhead === 0) return 'It is your turn now.';
    if (patientsAhead === 1) return 'One patient ahead of you.';
    return `${patientsAhead} patients ahead of you. Estimated wait ${estimatedWaitTime}.`;
  })();

  // Determine current step for stepper and animation
  const currentStepIndex = (() => {
    if (!patientStatus) return 0;
    if (patientStatus === 'completed') return 3; // Done
    if (patientStatus === 'in-progress') return 2; // Ready (explicitly when called)
    if (patientStatus === 'cancelled') {
      // Freeze at last known threshold; no animation will be shown for cancelled
      if (progressPercentage >= 95) return 2;
      if (progressPercentage >= 5) return 1;
      return 0;
    }
    // For 'waiting', treat as already 'In Queue' regardless of progress so both 'Joined' and 'In Queue' show as completed.
    return 1;
  })();

  const isCancelling = actionState === 'cancelling';
  const isRejoining = actionState === 'rejoining';
  const canCancel = patientStatus === 'waiting' && !!accessToken && !requiresRelogin;
  const canRejoin = patientStatus === 'cancelled' && !!accessToken && !requiresRelogin;

  const handleReconnectSession = useCallback(async () => {
    if (sessionRetryPending) {
      return;
    }

    setSessionError(null);
    setRealtimeError(null);
    setSessionRetryPending(true);
    const result = await refreshSession({ silent: false });
    if (result.ok) {
      setRequiresRelogin(false);
    } else {
      setSessionError(result.message ?? 'Unable to reconnect your session. Please try again.');
    }
    setSessionRetryPending(false);
  }, [refreshSession, sessionRetryPending]);

  if (isLoading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent mx-auto" />
          <p className="text-sm font-medium text-gray-600">Loading your queue status…</p>
        </div>
      </div>
    );
  }

  // Compact, mobile-first UI inspired by sample: single glass card centered, no scrolling for key info
  return (
    <div className="relative min-h-screen w-full antialiased text-gray-800 flex items-start sm:items-center justify-center px-4 pt-6 pb-6 sm:py-6 bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30" aria-describedby="queue-live-region">
      <div id="queue-live-region" aria-live="polite" className="sr-only">{liveMessage}</div>

      {/* Background gradient aurora */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[28rem] h-[28rem] rounded-full bg-gradient-to-br from-blue-200/40 via-cyan-100/30 to-transparent blur-3xl opacity-60" />
        <div className="absolute top-1/2 -right-40 w-[26rem] h-[26rem] rounded-full bg-gradient-to-tr from-cyan-100/30 via-blue-200/30 to-transparent blur-3xl opacity-50" />
      </div>

      {/* Main glass card */}
      <main className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl shadow-2xl shadow-blue-500/10 p-5 sm:p-7 space-y-6 bg-white/70 backdrop-blur-xl border border-white/40">
          {/* Doctor Info */}
          <header className="text-center">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 bg-gradient-to-br from-blue-900 via-blue-700 to-sky-600 bg-clip-text text-transparent">
              {doctor?.name || '—'}
            </h1>
            <p className="text-xs text-gray-600 mt-1 font-medium">{doctor?.specialty || 'Clinic'}</p>
          </header>

          {requiresRelogin ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-center space-y-3">
              <p className="text-sm font-semibold text-amber-900">Your session expired</p>
              <p className="text-xs text-amber-900/80">Reconnect to keep receiving live queue updates.</p>
              <Button
                variant="accent"
                className="w-full"
                loading={sessionRetryPending}
                onClick={handleReconnectSession}
              >
                {sessionRetryPending ? 'Reconnecting…' : 'Reconnect to Queue'}
              </Button>
            </div>
          ) : null}

          {showErrorBanner ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-xs text-blue-900">
              {error}
            </div>
          ) : null}

          {/* Token Display */}
          <section className="text-center space-y-3">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Your Token Number</p>
            <div className="bg-gradient-to-br from-blue-800 via-blue-600 to-sky-500 bg-clip-text text-transparent text-6xl sm:text-7xl font-extrabold tracking-tighter">
              {patient?.tokenNumber ?? '—'}
            </div>
          </section>

          {/* Queue Stats */}
          <section className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/50">
              <p className="text-[10px] sm:text-xs font-semibold text-emerald-700 uppercase tracking-wide">Now Serving</p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600 mt-1">{nowServingDisplay}</p>
            </div>
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200/50">
              <p className="text-[10px] sm:text-xs font-semibold text-orange-700 uppercase tracking-wide">Ahead</p>
              <p className="text-2xl sm:text-3xl font-bold text-orange-600 mt-1">{patientsAhead}</p>
            </div>
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/50">
              <p className="text-[10px] sm:text-xs font-semibold text-blue-700 uppercase tracking-wide">Est. Wait</p>
              <p className="text-sm font-bold text-blue-800 mt-2">{estimatedWaitTime}</p>
            </div>
          </section>

          {/* Stepper: 4 compact steps (center-aligned) */}
          <section>
            <div className="relative">
              <div className="absolute top-5 left-0 right-0 h-[2px] bg-slate-200" aria-hidden />
              <ol className="relative flex items-center justify-between px-2">
                {['Joined','In Queue','Ready','Done'].map((label, idx) => {
                  const isActive = patientStatus === 'completed' ? true : idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex && patientStatus !== 'completed' && patientStatus !== 'cancelled';
                  return (
                    <li key={label} className="relative flex-1 flex flex-col items-center gap-1.5 text-center">
                      <span className={`relative h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shadow-md transition-all ${isActive ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white ring-4 ring-blue-50' : 'bg-slate-200 text-slate-400'}`}>
                        {isCurrent && <span className="animate-ping absolute inset-0 rounded-full bg-blue-400 opacity-75" aria-hidden />}
                        <span className="relative z-10">
                          {patientStatus === 'completed' && idx === 3 ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                          ) : (
                            idx+1
                          )}
                        </span>
                      </span>
                      <span className={`text-[11px] font-semibold ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>{label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {/* Info + Action */}
          {patientStatus === 'cancelled' && patient && (
            <div className="p-4 rounded-xl border border-red-200/80 bg-gradient-to-br from-red-50 to-red-100/50 flex items-start gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-600 mt-1.5" aria-hidden />
              <p className="text-xs text-red-900 leading-relaxed font-medium">Your token (#{patient.tokenNumber}) has been cancelled. Please contact the clinic or re-join.</p>
            </div>
          )}

          {actionError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          ) : null}

          {canCancel ? (
            <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => !isCancelling && setCancelDialogOpen(open)}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="soft-destructive"
                  className="w-full"
                  loading={isCancelling}
                >
                  Cancel My Token
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel your token?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove you from the queue immediately. You can rejoin later, but you will receive a new token number and move to the back of the line.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isCancelling}>Keep My Token</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isCancelling}
                    onClick={(event) => {
                      event.preventDefault();
                      handleCancelToken();
                    }}
                  >
                    {isCancelling ? 'Cancelling…' : 'Yes, cancel token'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : canRejoin ? (
            <div className="space-y-2">
              <Button
                variant="accent"
                className="w-full"
                loading={isRejoining}
                onClick={handleRejoinQueue}
              >
                Rejoin Queue
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You will receive a new token number and join the current end of the queue.
              </p>
            </div>
          ) : (
            <Button className="w-full" variant="outline" disabled>
              {patientStatus === 'completed'
                ? 'Consultation Completed'
                : patientStatus === 'in-progress'
                  ? 'Currently Being Served'
                  : 'Cancellation unavailable'}
            </Button>
          )}

        </div>
      </main>
    </div>
  );
}
