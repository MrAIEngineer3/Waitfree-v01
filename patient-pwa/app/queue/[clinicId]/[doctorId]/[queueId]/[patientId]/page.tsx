"use client";

import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { db, functions } from '../../../../../../lib/firebase';

interface Patient {
  id: string;
  name: string;
  age: number;
  phone: string;
  tokenNumber: number;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled';
  joinedAt: Date | { seconds: number; nanoseconds: number };
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
  createdAt?: Date | { seconds: number; nanoseconds: number };
  updatedAt?: Date | { seconds: number; nanoseconds: number };
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinicId: string;
  email?: string;
  phone?: string;
}

export default function QueueStatus() {
  const params = useParams();
  const clinicId = Array.isArray((params as any)?.clinicId) ? (params as any).clinicId[0] : (params as any)?.clinicId as string | undefined;
  const doctorId = Array.isArray((params as any)?.doctorId) ? (params as any).doctorId[0] : (params as any)?.doctorId as string | undefined;
  const queueId = Array.isArray((params as any)?.queueId) ? (params as any).queueId[0] : (params as any)?.queueId as string | undefined;
  const patientId = Array.isArray((params as any)?.patientId) ? (params as any).patientId[0] : (params as any)?.patientId as string | undefined;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const setupListeners = () => {
      try {
        // Construct direct document paths using URL parameters
        const patientRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId, 'patients', patientId);
        const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId);
        const doctorRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);

        // Patient: fetch via secure function with token stored in sessionStorage
        (async () => {
          try {
            const storedToken = sessionStorage.getItem(`patientToken:${patientId}`);
            if (!storedToken) {
              setError('Missing access token. Please re-join the queue or use the join form.');
              setIsLoading(false);
              return;
            }

            // Call the callable functions API to obtain the secure patient view
            const getViewFn = httpsCallable(functions, 'getPatientView');
            const callResp = await getViewFn({ clinicId, doctorId, queueId, patientId, token: storedToken });
            const data = callResp?.data as any;

            if (data && data.patient) {
              setPatient(data.patient as Patient);

              // After initial secure fetch, attach real-time listener to patient doc for status updates
              const patientRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId, 'patients', patientId);
              unsubscribePatient = onSnapshot(patientRef, (snap) => {
                if (snap.exists()) {
                  const livePatient = { id: snap.id, ...snap.data() } as Patient;
                  setPatient((prev) => {
                    // Preserve immutable fields from initial secure fetch if absent in snapshot
                    return { ...prev, ...livePatient } as Patient;
                  });
                }
              }, (err) => {
                console.warn('Patient realtime listener error:', err);
              });
            } else {
              setError('Failed to fetch patient data');
              setIsLoading(false);
              return;
            }
          } catch (err) {
            console.error('Error fetching patient via callable function:', err);
            setError((err as any)?.message || 'Error fetching patient data');
            setIsLoading(false);
            return;
          }
        })();

        // Queue listener
        unsubscribeQueue = onSnapshot(queueRef, (snapshot) => {
          if (snapshot.exists()) {
            const queueData = {
              id: snapshot.id,
              ...snapshot.data()
            } as Queue;
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
            const doctorData = {
              id: snapshot.id,
              ...snapshot.data()
            } as Doctor;
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
  

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Loading your queue status...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Data not loaded yet
  if (!patient || !queue || !doctor) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-gray-600 text-sm">Loading queue information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-14 max-w-2xl mx-auto px-4 pb-28 sm:pb-16" aria-describedby="queue-live-region">
      <div id="queue-live-region" aria-live="polite" className="sr-only">{liveMessage}</div>
      {/* Mobile Sticky Summary (hidden on larger screens) */}
  <div className="sm:hidden fixed top-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 px-4 py-2 flex items-center justify-between text-xs" role="status" aria-label="Queue summary">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-gray-500">Now</span>
          <span className="text-base font-bold text-emerald-600">{nowServingDisplay}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-gray-500">Ahead</span>
          <span className="text-base font-bold text-orange-600">{patientsAhead}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-gray-500">ETA</span>
          <span className="text-xs font-medium text-gray-800">{estimatedWaitTime}</span>
        </div>
      </div>
      <div className="sm:hidden h-14" />
      {patient.status === 'cancelled' && (
        <div className="max-w-md mx-auto w-full rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          <p className="font-medium mb-1">Queue Entry Cancelled</p>
          <p className="text-xs leading-relaxed">Your token (#{patient.tokenNumber}) has been cancelled. If you still need to see the doctor, please return to reception or use the join form again to get a new token.</p>
        </div>
      )}
      <header className="text-center space-y-3">
        <h1 className="wf-gradient-text text-2xl sm:text-3xl font-semibold tracking-tight">{doctor.name}</h1>
        <p className="text-sm text-gray-600">{doctor.specialty}</p>
      </header>
      <section className="flex flex-col items-center gap-10">
        <div className="flex items-center gap-8">
          <div className="wf-token-ring shadow-inner relative">
            <span className="sr-only">Your token number</span>
            {patient.tokenNumber}
            {/* Status Chip */}
            <span
              aria-label={`Status: ${patient.status.replace('-', ' ')}`}
              className={"absolute -bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wide shadow-sm border backdrop-blur-sm " +
                (patient.status === 'completed' ? 'bg-emerald-600/90 text-white border-emerald-500' :
                 patient.status === 'in-progress' ? 'bg-blue-600/90 text-white border-blue-500' :
                 patient.status === 'cancelled' ? 'bg-red-600/90 text-white border-red-500' :
                 'bg-gray-800/90 text-white border-gray-700')}
            >
              {patient.status === 'in-progress' ? 'In Progress' :
               patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
            </span>
          </div>
          <div className="hidden sm:flex flex-col gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 animate-pulse" />
              <span>Live updates active</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Now serving {nowServingDisplay}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              <span>{patientsAhead} ahead of you</span>
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-5 w-full">
          <div className="wf-card p-5 flex flex-col gap-2 text-center">
            <p className="text-[11px] tracking-wide font-medium text-gray-600 uppercase">Now Serving</p>
            <p className="text-3xl font-bold tracking-tight text-emerald-600">{nowServingDisplay}</p>
          </div>
          <div className="wf-card p-5 flex flex-col gap-2 text-center">
            <p className="text-[11px] tracking-wide font-medium text-gray-600 uppercase">Patients Ahead</p>
            <p className="text-3xl font-bold tracking-tight text-orange-500">{patientsAhead}</p>
          </div>
          <div className="wf-card p-5 flex flex-col gap-2 text-center">
            <p className="text-[11px] tracking-wide font-medium text-gray-600 uppercase">ETA</p>
            <p className="text-lg font-semibold text-gray-800">{estimatedWaitTime}</p>
          </div>
        </div>
      </section>
      <section className="space-y-10">
  <div className="wf-card p-6">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
            <span className="font-medium tracking-wide">Progress to Your Turn</span>
            <span className="font-semibold text-gray-700">{Math.round(progressPercentage)}%</span>
          </div>
          <div className="relative h-3 w-full rounded-full bg-gray-200 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 animate-[wf-bar_8s_linear_infinite] opacity-30" style={{ width: `${progressPercentage}%` }} />
            <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-700" style={{ width: `${progressPercentage}%` }} />
          </div>
          <style jsx>{`
            @keyframes wf-bar { to { transform: translateX(25%); } }
          `}</style>
        </div>
  <div className="wf-card p-6">
          <ol className="flex items-center justify-between text-[10px] font-medium tracking-wide text-gray-500">
            {['Joined','Queued','Approaching','Ready','Completed'].map((step, idx) => {
              const pct = progressPercentage;
              const active = (() => {
                if (patient.status === 'completed') return true; // All steps active
                if (patient.status === 'in-progress') return idx <= 3; // Up to Ready
                if (patient.status === 'cancelled') {
                  // Reflect frozen progress: mark steps based on stored pct thresholds
                  if (idx === 0) return true;
                  if (idx === 1 && pct >= 5) return true;
                  if (idx === 2 && pct >= 55) return true;
                  if (idx === 3 && pct >= 95) return true;
                  return false;
                }
                // waiting
                if (idx === 0) return true; // Joined
                if (idx === 1 && pct >= 5) return true; // Queued
                if (idx === 2 && pct >= 55) return true; // Approaching
                if (idx === 3 && pct >= 95) return true; // Ready (should be rare for waiting patient)
                return false;
              })();
              return (
                <li key={step} className={`flex-1 flex flex-col items-center gap-2 relative ${idx !== 0 ? 'before:content-["" ] before:absolute before:-left-1/2 before:top-3 before:h-[2px] before:w-full before:bg-gradient-to-r before:from-gray-200 before:to-gray-200' : ''}`}>
                  <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shadow-sm ${active ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{idx+1}</span>
                  <span className={`transition-colors ${active ? 'text-gray-800' : 'text-gray-400'}`}>{step}</span>
                </li>
              );
            })}
          </ol>
        </div>
  <div className="p-5 rounded-xl border border-blue-200/60 bg-blue-50/70 flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse mt-1" aria-hidden="true" />
          <p className="text-sm text-blue-900 leading-relaxed">
            Keep this page open. Your view updates instantly as the queue advances. We'll add push / SMS alerts in a later release.
          </p>
        </div>
        <div>
          <button
            className="w-full bg-gray-900 text-white py-4 px-6 rounded-xl font-medium text-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed active:scale-[.985]"
            disabled
            title="Cancellation coming soon"
          >
            Cancel My Token (Soon)
          </button>
          <p className="text-[11px] text-gray-500 mt-3 text-center">Cancellation & reschedule options are being finalized.</p>
        </div>
      </section>
      {/* Sticky bottom helper bar (mobile) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-t border-gray-200 px-4 py-3 flex items-center justify-between text-[11px]" role="contentinfo" aria-label="Your token details" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 0.75rem)' }}>
        <div className="flex flex-col">
          <span className="font-semibold text-gray-700">Status</span>
          <span className="text-gray-600 capitalize">{patient.status.replace('-', ' ')}</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="font-semibold text-gray-700">Token</span>
          <span className="text-gray-800 font-bold">#{patient.tokenNumber}</span>
        </div>
      </div>
    </div>
  );
}
