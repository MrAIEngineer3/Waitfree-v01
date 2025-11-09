"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useClinicContext } from '../components/ClinicContext';
import CompactStatsBar from '../components/CompactStatsBar';
import DateNavigator from '../components/DateNavigator';
import { Button } from '../components/ui/Button';
import { Separator } from '../components/ui/separator';
import { auth, functions } from '../lib/firebase';
import {
    useDashboardQueueDocRealtimeBridge,
    type DashboardQueue,
    type DashboardQueuePatient,
    type QueueStatus,
} from '../lib/hooks/use-dashboard-queue-realtime-bridge';
import { markPhase, queueProfilingEnabled, recordRender, recordSnapshot } from '../lib/profiling';
import { computeQueueSummaryStats } from '../lib/queueStats';
import type { QueueSummaryStats } from '../types/queue';
import ImprovedQueueList from './ImprovedQueueList';
import { ManualAddPatientDialog } from './ManualAddPatientDialog';

const getTodayKey = () => {
  try {
    return new Date().toISOString().split('T')[0];
  } catch {
    return '';
  }
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return fallback;
};

export default function DashboardImpl() {
  const { clinicId, doctorId } = useClinicContext();
  const queryClient = useQueryClient();
  const [authReady, setAuthReady] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayKey());
  const todayKey = useMemo(getTodayKey, []);
  const [queueRealtimeError, setQueueRealtimeError] = useState<string | null>(null);
  const [isNextPatientLoading, setIsNextPatientLoading] = useState(false);
  const [isAutoAdvUpdating, setIsAutoAdvUpdating] = useState(false);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);

  const renderLabel = useMemo(() => {
    const clinic = clinicId ?? 'clinic?';
    const doctor = doctorId ?? 'doctor?';
    return `Dashboard:${clinic}:${doctor}:${selectedDate}`;
  }, [clinicId, doctorId, selectedDate]);

  const renderLabelRef = useRef(renderLabel);

  useEffect(() => {
    renderLabelRef.current = renderLabel;
  }, [renderLabel]);

  const renderStart = queueProfilingEnabled ? performance.now() : 0;
  useEffect(() => {
    if (queueProfilingEnabled) {
      recordRender(renderLabel, performance.now() - renderStart);
    }
  });

  const queueQueryKey = useMemo(
    () => ['dashboard', 'queue', clinicId ?? '', doctorId ?? '', selectedDate] as const,
    [clinicId, doctorId, selectedDate]
  );

  const patientsQueryKey = useMemo(
    () => ['patients', clinicId ?? '', doctorId ?? '', selectedDate] as const,
    [clinicId, doctorId, selectedDate]
  );

  const queueQuery = useQuery<DashboardQueue | null>({
    queryKey: queueQueryKey,
    enabled: false,
    queryFn: async () => null,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  const patientsQuery = useQuery<DashboardQueuePatient[]>({
    queryKey: patientsQueryKey,
    enabled: false,
    queryFn: async () => [],
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  const queueSnapshotLabel = useMemo(() => `${renderLabel}:queue`, [renderLabel]);

  const handleQueueRealtimeError = useCallback((message: string | null) => {
    if (message) {
      setQueueRealtimeError('Unable to load queue details. Please refresh and try again.');
    } else {
      setQueueRealtimeError(null);
    }
  }, []);

  const handleQueueSnapshotMeta = useCallback(
    (meta: { size: number; latencyMs: number }) => {
      if (queueProfilingEnabled) {
        recordSnapshot(queueSnapshotLabel, meta);
      }
    },
    [queueSnapshotLabel]
  );

  const { isHydrated: queueHydrated } = useDashboardQueueDocRealtimeBridge({
    enabled: Boolean(clinicId && doctorId && selectedDate),
    clinicId,
    doctorId,
    queueId: selectedDate,
    queryKey: queueQueryKey,
    onError: handleQueueRealtimeError,
    onSnapshotMeta: handleQueueSnapshotMeta,
  });

  useEffect(() => {
    if (!clinicId || !doctorId) {
      setQueueRealtimeError(null);
    }
  }, [clinicId, doctorId]);

  const queue = queueHydrated ? queueQuery.data ?? null : null;

  const queueStats = useMemo<QueueSummaryStats>(
    () => computeQueueSummaryStats({ patients: patientsQuery.data, queue }),
    [patientsQuery.data, queue]
  );

  useEffect(() => {
    const phaseLabel = `${renderLabelRef.current}:auth`;
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
  }, []);

  const handleNextPatient = async () => {
    if (!clinicId || !doctorId || !selectedDate) {
      return;
    }

    const cachedPatients = queryClient.getQueryData<DashboardQueuePatient[] | undefined>(patientsQueryKey);
    const currentPatient = cachedPatients?.find((patient) => patient.status === 'in-progress') ?? null;
    const nextPatient = cachedPatients?.find((patient) => patient.status === 'waiting') ?? null;

    if (cachedPatients && !currentPatient && !nextPatient) {
      toast.info('No patients to advance.');
      return;
    }

    setIsNextPatientLoading(true);

    const previousQueue = queryClient.getQueryData<DashboardQueue | null>(queueQueryKey);
    const previousPatients = cachedPatients;

    if (cachedPatients) {
      const optimisticPatients = cachedPatients.map((patient) => {
        if (currentPatient && patient.id === currentPatient.id) {
          return { ...patient, status: 'completed' };
        }
        if (nextPatient && patient.id === nextPatient.id) {
          return { ...patient, status: 'in-progress' };
        }
        return patient;
      });

      queryClient.setQueryData(patientsQueryKey, optimisticPatients);
    }

    if (previousQueue) {
      const completedPatients = typeof previousQueue.completedPatients === 'number' ? previousQueue.completedPatients : 0;
      const queueAfterComplete: DashboardQueue = {
        ...previousQueue,
        completedPatients: currentPatient ? completedPatients + 1 : completedPatients,
        currentToken: currentPatient
          ? Math.max(previousQueue.currentToken, currentPatient.tokenNumber)
          : previousQueue.currentToken,
        updatedAt: new Date(),
      };

      const queueAfterCall = nextPatient
        ? {
            ...queueAfterComplete,
            currentToken: nextPatient.tokenNumber,
            updatedAt: new Date(),
          }
        : queueAfterComplete;

      queryClient.setQueryData(queueQueryKey, queueAfterCall);
    }

    try {
      const advanceQueue = httpsCallable(functions, 'advanceQueue');
      await advanceQueue({ clinicId, doctorId, queueId: selectedDate });
      toast.success('Called next patient');
    } catch (error) {
      if (previousQueue !== undefined) {
        queryClient.setQueryData(queueQueryKey, previousQueue ?? null);
      }

      if (previousPatients !== undefined) {
        queryClient.setQueryData(patientsQueryKey, previousPatients);
      } else {
        queryClient.removeQueries({ queryKey: patientsQueryKey, exact: true });
      }

      console.error('Error advancing queue:', error);
      toast.error(getErrorMessage(error, 'Failed to advance queue'));
    } finally {
      setIsNextPatientLoading(false);
    }
  };

  const handleToggleAutoAdvance = async (enabled: boolean) => {
    if (!clinicId || !doctorId || !selectedDate) return;
    setIsAutoAdvUpdating(true);
    const previousQueue = queryClient.getQueryData<DashboardQueue | null>(queueQueryKey);

    if (previousQueue) {
      queryClient.setQueryData(queueQueryKey, {
        ...previousQueue,
        autoAdvance: enabled,
        updatedAt: new Date(),
      });
    }

    try {
      const setQueueAutoAdvanceCallable = httpsCallable(functions, 'setQueueAutoAdvance');
      await setQueueAutoAdvanceCallable({ clinicId, doctorId, queueId: selectedDate, enabled });
      toast.success(enabled ? 'Auto-advance enabled' : 'Auto-advance disabled');
    } catch (error) {
      console.error('Error toggling auto-advance:', error);
      toast.error(getErrorMessage(error, 'Failed to update setting'));
      if (previousQueue) {
        queryClient.setQueryData(queueQueryKey, previousQueue);
      }
    } finally {
      setIsAutoAdvUpdating(false);
    }
  };

  const queueStatusValue: QueueStatus | undefined = queue?.status;
  const manualAddDisabled = !clinicId || !doctorId || !selectedDate || queueStatusValue === 'ended' || queueStatusValue === 'closed';

  return (
    <>
      <div className="space-y-4">
        {/* Compact Stats Bar */}
        <CompactStatsBar stats={queueStats} />

        {/* Main Queue Management - Hero Section */}
        <div className="w-full">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Queue header with integrated controls */}
            <div className="border-b border-border bg-muted/30 px-4 md:px-6 py-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-foreground/5 flex items-center justify-center">
                      <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Queue Management</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Manage today&apos;s patient queue</p>
                    </div>
                  </div>
                  <DateNavigator value={selectedDate} onChange={setSelectedDate} max={todayKey} disableFuture showTodayButton />
                </div>

                {/* Queue Control Buttons */}
                {queue && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => setIsAddPatientOpen(true)}
                      disabled={manualAddDisabled}
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add Patient
                    </Button>

                    <Separator orientation="vertical" className="h-8" />

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleNextPatient}
                      disabled={isNextPatientLoading || queue.status === 'paused' || queue.status === 'ended' || queue.autoAdvance}
                    >
                      {isNextPatientLoading ? (
                        <>
                          <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Next Patient
                        </>
                      )}
                    </Button>

                    <Separator orientation="vertical" className="h-8" />

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('togglePauseQueue'));
                      }}
                    >
                      {queue.status === 'paused' ? (
                        <>
                          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Resume
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      End Queue
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('restartQueue'));
                      }}
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Restart
                    </Button>

                    <Separator orientation="vertical" className="h-8" />

                    <label className="flex items-center gap-2 px-3 h-8 text-sm text-foreground bg-background border border-input rounded-md hover:bg-accent cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={queue.autoAdvance ?? false}
                        disabled={isAutoAdvUpdating}
                        onChange={(e) => handleToggleAutoAdvance(e.target.checked)}
                        className="h-4 w-4 rounded border-input cursor-pointer accent-foreground"
                      />
                      <span className="font-medium whitespace-nowrap">Auto-advance</span>
                      {isAutoAdvUpdating && (
                        <svg className="w-3 h-3 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Queue List - Full width content */}
            <div className="w-full">
              {queueRealtimeError && (
                <div className="mx-4 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {queueRealtimeError}
                </div>
              )}
              {clinicId && doctorId && (
                <ImprovedQueueList
                  clinicId={clinicId}
                  doctorId={doctorId}
                  queueStatus={queue?.status}
                  dayKey={selectedDate}
                />
              )}
              {(!clinicId || !doctorId) && authReady && (
                <div className="p-12 text-center">
                  <div className="max-w-md mx-auto space-y-4">
                    <div className="h-14 w-14 mx-auto rounded-lg bg-muted flex items-center justify-center">
                      <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold text-foreground">Get Started</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Create or attach a clinic and doctor mapping to begin managing today&apos;s queue.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <ManualAddPatientDialog
          open={isAddPatientOpen}
          onOpenChange={setIsAddPatientOpen}
          clinicId={clinicId ?? null}
          doctorId={doctorId ?? null}
          queueId={selectedDate ?? null}
          queueStatus={queueStatusValue}
        />
      </div>
    </>
  );
}
