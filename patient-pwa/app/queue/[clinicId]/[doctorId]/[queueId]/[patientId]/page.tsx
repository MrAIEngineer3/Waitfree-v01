"use client";

export const dynamic = "force-dynamic";

import { signInWithCustomToken } from 'firebase/auth';
import { doc, onSnapshot, type DocumentData, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { auth, db, functions } from '../../../../../../lib/firebase';
import { ensurePatientToken } from './tokenStorage';
import { buildRejoinRedirectUrl } from './rejoinUtils';

interface Patient {
  id: string;
  name: string;
  age: number;
  phone: string;
  tokenNumber: number;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled';
  joinedAt: Date | Timestamp;
  queueId: string;
  clinicId: string;
  doctorId: string;
}

interface Queue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: 'active' | 'paused' | 'ended';
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  createdAt?: Date | Timestamp;
  updatedAt?: Date | Timestamp;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinicId: string;
  email?: string;
  phone?: string;
}

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

type PatientRejoinQueuePayload = PatientCancelTokenPayload;

interface PatientRejoinQueueResult {
  success: boolean;
  status: Patient['status'];
  message?: string;
  rejoin?: {
    clinicId: string;
    doctorId: string;
    queueId: string;
    patientId: string;
    accessToken: string;
  };
}

interface CreatePatientSessionPayload {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  token: string;
}

interface CreatePatientSessionResult {
  success: boolean;
  token: string;
  patient?: Partial<Patient> | null;
}

export default function QueueStatus() {
  const params = useParams<{ clinicId: string; doctorId: string; queueId: string; patientId: string }>();
  const router = useRouter();
  const clinicId = params?.clinicId;
  const doctorId = params?.doctorId;
  const queueId = params?.queueId;
  const patientId = params?.patientId;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'cancelling' | 'rejoining'>('idle');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    if (!clinicId || !doctorId || !queueId || !patientId) {
      setError('Missing required parameters in URL');
      setIsLoading(false);
      return;
    }

    // Hold unsubscribe functions to clean up listeners on unmount/param change
    let unsubscribePatient: (() => void) | null = null;
    let unsubscribeQueue: (() => void) | null = null;
    let unsubscribeDoctor: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        // 0) Token fallback: if sessionStorage is missing the access token but the URL has ?t=,
        //    persist it and immediately scrub the URL to avoid accidental sharing.
        try {
          ensurePatientToken({
            patientId,
            storage: window.sessionStorage,
            locationUrl: new URL(window.location.href),
            replaceUrl: (cleaned) => window.history.replaceState({}, '', cleaned)
          });
        } catch (scrubErr) {
          // Non-fatal; continue with normal flow
          console.warn('Token URL scrub failed (non-fatal):', scrubErr);
        }

        // Construct direct document paths using URL parameters
        const patientRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId, 'patients', patientId);
        const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId);
        const doctorRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);

        const storedToken = sessionStorage.getItem(`patientToken:${patientId}`);
        if (!storedToken) {
          setError('Missing access token. Please re-join the queue or use the join form.');
          setIsLoading(false);
          return;
        }
        setAccessToken(storedToken);

        try {
          const createSessionFn = httpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>(functions, 'createPatientSession');
          const sessionResponse = await createSessionFn({ clinicId, doctorId, queueId, patientId, token: storedToken });
          const customToken = sessionResponse.data?.token;

          if (!customToken) {
            setError('Unable to authenticate your session. Please re-join the queue.');
            setIsLoading(false);
            return;
          }

          await signInWithCustomToken(auth, customToken);
        } catch (authErr) {
          console.error('Failed to establish authenticated patient session', authErr);
          setError('Unable to authenticate your session. Please re-join the queue.');
          setIsLoading(false);
          return;
        }

        try {
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

          const getViewFn = httpsCallable<GetPatientViewPayload, GetPatientViewResult>(functions, 'getPatientView');
          const { data } = await getViewFn({ clinicId, doctorId, queueId, patientId, token: storedToken });

          if (data?.patient) {
            setPatient(data.patient);

            unsubscribePatient = onSnapshot(patientRef, (snap) => {
              if (!snap.exists()) return;
              const raw = snap.data() as DocumentData;
              const livePatient: Patient = {
                id: snap.id,
                name: typeof raw.name === 'string' ? raw.name : data.patient!.name,
                age: typeof raw.age === 'number' ? raw.age : data.patient!.age,
                phone: typeof raw.phone === 'string' ? raw.phone : data.patient!.phone,
                tokenNumber: typeof raw.tokenNumber === 'number' ? raw.tokenNumber : data.patient!.tokenNumber,
                status: (raw.status as Patient['status']) ?? data.patient!.status,
                joinedAt: (raw.joinedAt as Timestamp | Date | undefined) ?? data.patient!.joinedAt,
                queueId: typeof raw.queueId === 'string' ? raw.queueId : data.patient!.queueId,
                clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : data.patient!.clinicId,
                doctorId: typeof raw.doctorId === 'string' ? raw.doctorId : data.patient!.doctorId,
              };
              setPatient(livePatient);
            }, (listenerError) => {
              console.warn('Patient realtime listener error:', listenerError);
            });
          } else {
            setError('Failed to fetch patient data');
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('Error fetching patient via callable function:', err);
          const message = err instanceof Error ? err.message : 'Error fetching patient data';
          setError(message);
          setIsLoading(false);
          return;
        }

        // Queue listener
        unsubscribeQueue = onSnapshot(queueRef, (snapshot) => {
          if (snapshot.exists()) {
            const raw = snapshot.data() as DocumentData;
            const queueData: Queue = {
              id: snapshot.id,
              doctorId: typeof raw.doctorId === 'string' ? raw.doctorId : doctorId,
              clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : clinicId,
              status: (raw.status as Queue['status']) ?? 'active',
              currentToken: typeof raw.currentToken === 'number' ? raw.currentToken : 0,
              totalPatients: typeof raw.totalPatients === 'number' ? raw.totalPatients : 0,
              completedPatients: typeof raw.completedPatients === 'number' ? raw.completedPatients : 0,
              createdAt: (raw.createdAt as Timestamp | Date | undefined) ?? undefined,
              updatedAt: (raw.updatedAt as Timestamp | Date | undefined) ?? undefined,
            };
            setQueue(queueData);
          } else {
            setError('Queue document not found');
          }
        }, (error) => {
          console.error('Error fetching queue:', error);
          setError('Error fetching queue data');
        });

        // Doctor listener
        unsubscribeDoctor = onSnapshot(doctorRef, (snapshot) => {
          if (snapshot.exists()) {
            const raw = snapshot.data() as DocumentData;
            const doctorData: Doctor = {
              id: snapshot.id,
              name: typeof raw.name === 'string' ? raw.name : 'Doctor',
              specialty: typeof raw.specialty === 'string' ? raw.specialty : 'General Practice',
              clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : clinicId,
              email: typeof raw.email === 'string' ? raw.email : undefined,
              phone: typeof raw.phone === 'string' ? raw.phone : undefined,
            };
            setDoctor(doctorData);
            setIsLoading(false); // Set loading to false when we get the first successful data
          } else {
            setError('Doctor document not found');
            setIsLoading(false);
          }
        }, (error) => {
          console.error('Error fetching doctor:', error);
          setError('Error fetching doctor data');
          setIsLoading(false);
        });

      } catch (err) {
        console.error('Error setting up real-time listeners:', err);
        setError('Failed to load patient data');
        setIsLoading(false);
      }
    };

    setupListeners();
    return () => {
      try { unsubscribeQueue?.(); } catch {}
      try { unsubscribeDoctor?.(); } catch {}
      try { unsubscribePatient?.(); } catch {}
    };
  }, [clinicId, doctorId, queueId, patientId]);

  const handleCancelToken = async () => {
    if (!clinicId || !doctorId || !queueId || !patientId) {
      setActionError('Missing queue information.');
      return;
    }
    if (!accessToken) {
      setActionError('Missing access token. Please refresh the page.');
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
        setPatient((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
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

  const handleRejoinQueue = async () => {
    if (!clinicId || !doctorId || !queueId || !patientId) {
      setActionError('Missing queue information.');
      return;
    }
    if (!accessToken) {
      setActionError('Missing access token. Please refresh the page.');
      return;
    }

    setActionError(null);
    setActionState('rejoining');

    try {
      const rejoinFn = httpsCallable<PatientRejoinQueuePayload, PatientRejoinQueueResult>(functions, 'patientRejoinQueue');
      const { data } = await rejoinFn({ clinicId, doctorId, queueId, patientId, token: accessToken });

      if (data?.success && data.rejoin) {
        const { clinicId: newClinicId, doctorId: newDoctorId, queueId: newQueueId, patientId: newPatientId, accessToken: newToken } = data.rejoin;

        if (newToken) {
          try {
            sessionStorage.setItem(`patientToken:${newPatientId}`, newToken);
          } catch (storageErr) {
            console.warn('Failed to store new access token', storageErr);
          }
        }

        toast.success('You have rejoined the queue. Redirecting you to your updated token.');
        const nextUrl = buildRejoinRedirectUrl({
          clinicId: newClinicId,
          doctorId: newDoctorId,
          queueId: newQueueId,
          patientId: newPatientId,
          accessToken: newToken
        });
        router.push(nextUrl);
        return;
      }

      const fallback = data?.message ?? 'Unable to rejoin the queue. Please try again.';
      setActionError(fallback);
      toast.error(fallback);
    } catch (err) {
      const message = (err as { message?: string })?.message ?? 'Unable to rejoin the queue. Please try again.';
      setActionError(message);
      toast.error(message);
    } finally {
      setActionState('idle');
    }
  };

  // Calculate derived values (status-aware)
  let patientsAhead = 0;
  let progressPercentage = 0;
  let nowServingDisplay = queue?.currentToken || 0;
  const lastProgressRef = useRef<number>(0);
  if (patient && queue) {
    switch (patient.status) {
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
    if (patient.status !== 'cancelled') {
      lastProgressRef.current = progressPercentage;
    }
  }
  // Estimate wait time (rough calculation: 5 minutes per patient)
  const estimatedWaitTime = patientsAhead > 0 ? `~ ${patientsAhead * 5} minutes` : 'Your turn!';
  // Accessibility: live message
  const liveMessage = (() => {
    if (!patient || !queue) return '';
    if (patient.status === 'completed') return 'Your consultation is completed.';
    if (patient.status === 'cancelled') return 'Your token has been cancelled. If this was unexpected, please contact the clinic team to rejoin.';
    if (patient.status === 'in-progress') return 'Please proceed. It is your turn now.';
    if (patientsAhead === 0) return 'It is your turn now.';
    if (patientsAhead === 1) return 'One patient ahead of you.';
    return `${patientsAhead} patients ahead of you. Estimated wait ${estimatedWaitTime}.`;
  })();

  // Determine current step for stepper and animation
  const currentStepIndex = (() => {
    if (!patient) return 0;
    if (patient.status === 'completed') return 3; // Done
    if (patient.status === 'in-progress') return 2; // Ready (explicitly when called)
    if (patient.status === 'cancelled') {
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
  const canCancel = patient?.status === 'waiting' && !!accessToken;
  const canRejoin = patient?.status === 'cancelled' && !!accessToken;

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
                  const isActive = patient?.status === 'completed' ? true : idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex && patient?.status !== 'completed' && patient?.status !== 'cancelled';
                  return (
                    <li key={label} className="relative flex-1 flex flex-col items-center gap-1.5 text-center">
                      <span className={`relative h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shadow-md transition-all ${isActive ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white ring-4 ring-blue-50' : 'bg-slate-200 text-slate-400'}`}>
                        {isCurrent && <span className="animate-ping absolute inset-0 rounded-full bg-blue-400 opacity-75" aria-hidden />}
                        <span className="relative z-10">
                          {patient?.status === 'completed' && idx === 3 ? (
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
          {patient?.status === 'cancelled' && (
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
              {patient?.status === 'completed'
                ? 'Consultation Completed'
                : patient?.status === 'in-progress'
                  ? 'Currently Being Served'
                  : 'Cancellation unavailable'}
            </Button>
          )}

        </div>
      </main>
    </div>
  );
}
