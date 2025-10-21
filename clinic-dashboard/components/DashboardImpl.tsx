"use client";

import { onAuthStateChanged } from 'firebase/auth';
import type { Timestamp, Unsubscribe } from 'firebase/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useClinicContext } from '../components/ClinicContext';
import DateNavigator from '../components/DateNavigator';
import QueueList from '../components/QueueList';
import { Separator } from '../components/ui/separator';
import { Button } from '../components/ui/Button';
import { auth, db } from '../lib/firebase';
import { markPhase, queueProfilingEnabled, recordRender, recordSnapshot } from '../lib/profiling';

type QueueStatus = 'active' | 'paused' | 'ended';
type FirestoreTimestamp = Timestamp | { seconds: number; nanoseconds: number } | null;

interface QueueRecord {
  doctorId?: string;
  clinicId?: string;
  status?: QueueStatus;
  currentToken?: number;
  totalPatients?: number;
  completedPatients?: number;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  autoAdvance?: boolean;
}

interface Queue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: QueueStatus;
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  autoAdvance?: boolean;
}

const detach = (unsubscribe: Unsubscribe | null): null => {
  if (unsubscribe) {
    unsubscribe();
  }
  return null;
};

const getTodayKey = () => {
  try {
    return new Date().toISOString().split('T')[0];
  } catch {
    return '';
  }
};

export default function DashboardImpl() {
  const { clinicId, doctorId } = useClinicContext();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayKey());
  const todayKey = useMemo(getTodayKey, []);
  const queueSnapshotRef = useRef<number | null>(null);

  const renderLabel = useMemo(() => {
    const clinic = clinicId ?? 'clinic?';
    const doctor = doctorId ?? 'doctor?';
    return `Dashboard:${clinic}:${doctor}:${selectedDate}`;
  }, [clinicId, doctorId, selectedDate]);

  const renderStart = queueProfilingEnabled ? performance.now() : 0;
  useEffect(() => {
    if (queueProfilingEnabled) {
      recordRender(renderLabel, performance.now() - renderStart);
    }
  });

  useEffect(() => {
    if (!clinicId || !doctorId) {
      setQueue(null);
      return;
    }

    let unsubscribeQueue: Unsubscribe | null = null;
    const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', selectedDate);

    unsubscribeQueue = onSnapshot(
      queueRef,
      (snap) => {
        const start = queueProfilingEnabled ? performance.now() : 0;

        if (!snap.exists()) {
          setQueue(null);
          if (queueProfilingEnabled) {
            const end = performance.now();
            const previous = queueSnapshotRef.current;
            const latency = previous != null ? end - previous : end - start;
            recordSnapshot(`${renderLabel}:queue`, { size: 0, latencyMs: latency });
            queueSnapshotRef.current = end;
          }
          return;
        }

        const data = (snap.data() as QueueRecord | undefined) ?? {};
        setQueue({
          id: snap.id,
          doctorId: data.doctorId ?? doctorId,
          clinicId: data.clinicId ?? clinicId,
          status: data.status ?? 'active',
          currentToken: data.currentToken ?? 0,
          totalPatients: data.totalPatients ?? 0,
          completedPatients: data.completedPatients ?? 0,
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
          autoAdvance: data.autoAdvance ?? false,
        });

        if (queueProfilingEnabled) {
          const end = performance.now();
          const previous = queueSnapshotRef.current;
          const latency = previous != null ? end - previous : end - start;
          recordSnapshot(`${renderLabel}:queue`, { size: 1, latencyMs: latency });
          queueSnapshotRef.current = end;
        }
      },
      (error) => {
        console.error('[DashboardImpl] Failed to subscribe to queue', error);
        if (queueProfilingEnabled) {
          console.warn('[queue-profiler] queue listener error', error);
        }
      }
    );

    return () => {
      unsubscribeQueue = detach(unsubscribeQueue);
    };
  }, [clinicId, doctorId, selectedDate, renderLabel]);

  useEffect(() => {
    const phaseLabel = `${renderLabel}:auth`;
    let completed = false;

    if (queueProfilingEnabled) {
      markPhase(phaseLabel, 'start');
    }

    const unsubscribe = onAuthStateChanged(auth, () => {
      setAuthReady(true);
      if (queueProfilingEnabled && !completed) {
        markPhase(phaseLabel, 'end');
        completed = true;
      }
    });

    return () => {
      unsubscribe();
      if (queueProfilingEnabled && !completed) {
        markPhase(phaseLabel, 'end');
        completed = true;
      }
    };
  }, [renderLabel]);

  return (
    <div className="space-y-4">
      {/* Main Queue Management - Full width */}
      <div className="w-full">
        <div className="rounded-lg md:rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Queue header with integrated metrics */}
          <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white px-4 md:px-6 py-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-sm">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-gray-900">Today&apos;s Queue</h2>
                  </div>
                  <DateNavigator value={selectedDate} onChange={setSelectedDate} max={todayKey} disableFuture showTodayButton />
                </div>

                {/* Modern Queue Control Buttons */}
                {queue && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('togglePauseQueue'));
                      }}
                      className="h-9 shadow-sm hover:shadow"
                    >
                      {queue.status === 'paused' ? (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Resume
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Pause
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('endQueue'));
                      }}
                      className="h-9 text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 shadow-sm hover:shadow"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      End Today
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('restartQueue'));
                      }}
                      className="h-9 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 shadow-sm hover:shadow"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Restart
                    </Button>
                  </div>
                )}
              </div>

              {/* Compact metrics integrated into header */}
              {queue && (
                <>
                  <Separator className="my-2" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-blue-50/50 border border-blue-100">
                      <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Current Token</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-blue-600">#{queue.currentToken}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-green-50/50 border border-green-100">
                      <span className="text-xs font-medium text-green-700 uppercase tracking-wide">Completed</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-green-600">{queue.completedPatients}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-indigo-50/50 border border-indigo-100">
                      <span className="text-xs font-medium text-indigo-700 uppercase tracking-wide">Total Patients</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-indigo-600">{queue.totalPatients}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-orange-50/50 border border-orange-100">
                      <span className="text-xs font-medium text-orange-700 uppercase tracking-wide">Remaining</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-orange-600">{queue.totalPatients - queue.completedPatients}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Queue List - Full width content */}
          <div className="w-full">
            {clinicId && doctorId && (
              <QueueList
                clinicId={clinicId}
                doctorId={doctorId}
                queueStatus={queue?.status}
                dayKey={selectedDate}
                autoAdvance={queue?.autoAdvance}
              />
            )}
            {(!clinicId || !doctorId) && authReady && (
              <div className="p-8 text-center m-6">
                <div className="max-w-sm mx-auto space-y-4">
                  <div className="h-16 w-16 mx-auto rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">Get Started</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Create or attach a clinic and doctor mapping to begin managing today&apos;s queue.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
