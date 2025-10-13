"use client";

import { onAuthStateChanged } from 'firebase/auth';
import type { Timestamp, Unsubscribe } from 'firebase/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useClinicContext } from '../components/ClinicContext';
import DateNavigator from '../components/DateNavigator';
import QueueList from '../components/QueueList';
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
    <div className="space-y-3">
      {/* Clinic header condensed into AppShell to save vertical space */}

      {/* Active/Select Doctor section removed; doctor details shown in header */}

      {/* QR moved into modal, removed from main screen */}

      {/* Main Queue Management - Full width */}
      <div className="w-full">
        <div className="rounded-lg md:rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm shadow-sm overflow-hidden">
          {/* Queue header with integrated metrics */}
          <div className="border-b border-gray-200 px-3 md:px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <h2 className="text-lg md:text-xl font-semibold text-gray-900">Today&apos;s Queue</h2>
                  <DateNavigator value={selectedDate} onChange={setSelectedDate} max={todayKey} disableFuture showTodayButton />
                </div>

                {/* Modern Queue Control Buttons */}
                {queue && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="h-8 px-3 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('togglePauseQueue'));
                      }}
                    >
                      {queue.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      className="h-8 px-3 text-xs font-medium text-rose-600 bg-white hover:bg-rose-50 border border-rose-200 hover:border-rose-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('endQueue'));
                      }}
                    >
                      End Today
                    </button>
                    <button
                      className="h-8 px-3 text-xs font-medium text-emerald-600 bg-white hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('restartQueue'));
                      }}
                    >
                      Restart
                    </button>
                  </div>
                )}
              </div>

              {/* Compact metrics integrated into header */}
              {queue && (
                <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 sm:gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Current:</span>
                    <span className="font-semibold text-blue-600">#{queue.currentToken}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Completed:</span>
                    <span className="font-semibold text-green-600">{queue.completedPatients}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Total:</span>
                    <span className="font-semibold text-indigo-600">{queue.totalPatients}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Remaining:</span>
                    <span className="font-semibold text-orange-600">{queue.totalPatients - queue.completedPatients}</span>
                  </div>
                </div>
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
              <div className="p-8 text-center text-gray-600 bg-gray-50 rounded-lg border border-dashed border-gray-300 m-6">
                <p className="mb-2 font-medium text-gray-700">Get started</p>
                <p className="leading-relaxed">Create or attach a clinic and doctor mapping to begin managing today&apos;s queue.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* QR modal managed globally in AppShell */}
    </div>
  );
}
