'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { functions } from '../lib/firebase';
import { useDashboardQueueRealtimeBridge, type DashboardQueue, type DashboardQueuePatient } from '../lib/hooks/use-dashboard-queue-realtime-bridge';
import { useCallPatient, useCancelPatient, useCompletePatient, useUncallPatient } from '../lib/hooks/use-queue-mutations';
import { queueProfilingEnabled, recordRender } from '../lib/profiling';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return fallback;
};

export interface QueueListProps {
  clinicId?: string;
  doctorId?: string;
  queueStatus?: 'active' | 'paused' | 'ended' | 'closed';
  dayKey: string;
}

type Patient = DashboardQueuePatient;

// Helper function to calculate wait time
function getWaitTime(joinedAt: Patient['joinedAt']): string {
  if (!joinedAt) return '—';

  const maybeTimestamp = joinedAt as { toDate?: () => Date; seconds?: number };
  let joinTime: Date | null = null;

  if (joinedAt instanceof Date) {
    joinTime = joinedAt;
  } else if (typeof maybeTimestamp?.toDate === 'function') {
    joinTime = maybeTimestamp.toDate();
  } else if (typeof maybeTimestamp?.seconds === 'number') {
    joinTime = new Date(maybeTimestamp.seconds * 1000);
  }

  if (!joinTime) return '—';
  const now = new Date();
  const diff = Math.floor((now.getTime() - joinTime.getTime()) / 60000); // minutes
  
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m`;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hours}h ${mins}m`;
}

const formatAge = (value: number | undefined): string => {
  if (typeof value === 'number' && value > 0) {
    return `${value} yrs`;
  }
  return '—';
};

const formatPhone = (value: string | undefined): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return '—';
};

export default function ImprovedQueueList({ 
  clinicId: clinicIdProp, 
  doctorId: doctorIdProp, 
  queueStatus, 
  dayKey
}: QueueListProps) {
  
  // ... [Keep all the existing state and logic from original QueueList]
  // I'll show the render part with the new UI

  const renderLabel = useMemo(() => {
    const clinic = clinicIdProp ?? 'clinic?';
    const doctor = doctorIdProp ?? 'doctor?';
    return `QueueList:${clinic}:${doctor}:${dayKey}`;
  }, [clinicIdProp, doctorIdProp, dayKey]);
  
  const renderStart = queueProfilingEnabled ? performance.now() : 0;

  useEffect(() => {
    if (!queueProfilingEnabled) return;
    const duration = performance.now() - renderStart;
    recordRender(renderLabel, duration);
  }, [renderLabel, renderStart]);

  const [isNextPatientLoading, setIsNextPatientLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPatientId, setCancelPatientId] = useState<string | null>(null);
  const [isCancellingPatient, setIsCancellingPatient] = useState(false);
  const [showUncallModal, setShowUncallModal] = useState(false);
  const [uncallPatientId, setUncallPatientId] = useState<string | null>(null);
  const [isUncallingPatient, setIsUncallingPatient] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completePatientId, setCompletePatientId] = useState<string | null>(null);
  const [completePatientName, setCompletePatientName] = useState<string | null>(null);
  const [isCompletingPatient, setIsCompletingPatient] = useState(false);
  const [cancelPatientName, setCancelPatientName] = useState<string | null>(null);
  const [uncallPatientName, setUncallPatientName] = useState<string | null>(null);
  const [loadingPatientIds, setLoadingPatientIds] = useState<Set<string>>(new Set());
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [statusDialog, setStatusDialog] = useState<null | {
    mode: 'pause' | 'resume' | 'end' | 'restart';
    targetStatus: 'paused' | 'active' | 'ended';
  }>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [endConfirmText, setEndConfirmText] = useState('');
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const clinicId = clinicIdProp;
  const doctorId = doctorIdProp;
  const queueId = dayKey;

  const patientsQueryKey = useMemo(
    () => ['patients', clinicId ?? '', doctorId ?? '', queueId] as const,
    [clinicId, doctorId, queueId]
  );

  const patientsQuery = useQuery<Patient[]>({
    queryKey: patientsQueryKey,
    enabled: false,
    queryFn: async () => [],
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  const queueDocQueryKey = useMemo(
    () => ['dashboard', 'queue', clinicId ?? '', doctorId ?? '', queueId] as const,
    [clinicId, doctorId, queueId]
  );

  const handlePatientsRealtimeError = useCallback((message: string | null) => {
    if (message) {
      setRealtimeError('Unable to load patient list. Please refresh and try again.');
    } else {
      setRealtimeError(null);
    }
  }, []);

  const { isHydrated: patientsHydrated } = useDashboardQueueRealtimeBridge({
    enabled: Boolean(clinicId && doctorId),
    clinicId,
    doctorId,
    queueId,
    queryKey: patientsQueryKey,
    onError: handlePatientsRealtimeError,
  });

  const patients = useMemo(() => patientsQuery.data ?? [], [patientsQuery.data]);
  const loadingPatients = Boolean(clinicId && doctorId) && !patientsHydrated;

  useEffect(() => {
    if (!clinicId || !doctorId) {
      setRealtimeError(null);
    }
  }, [clinicId, doctorId]);

  // TanStack Query mutation hooks for optimistic updates
  const callPatientMutation = useCallPatient(clinicId || '', doctorId || '', queueId);
  const completePatientMutation = useCompletePatient(clinicId || '', doctorId || '', queueId);
  const cancelPatientMutation = useCancelPatient(clinicId || '', doctorId || '', queueId);
  const uncallPatientMutation = useUncallPatient(clinicId || '', doctorId || '', queueId);

  const endedFlag = queueStatus === 'ended' || queueStatus === 'closed';
  const isReadOnly = dayKey !== new Date().toISOString().split('T')[0] || endedFlag;
  const queueInactive = queueStatus === 'paused' || endedFlag;

  const updateQueueStatus = async (targetStatus: 'paused' | 'active' | 'ended') => {
    if (!clinicId || !doctorId || !queueId) {
      toast.error('Missing clinic or doctor information.');
      return false;
    }
    setStatusUpdating(true);
    const previousQueue = queryClient.getQueryData<DashboardQueue | null>(queueDocQueryKey);

    if (previousQueue) {
      queryClient.setQueryData(queueDocQueryKey, {
        ...previousQueue,
        status: targetStatus,
        updatedAt: new Date(),
      });
    }
    try {
      const callable = httpsCallable(functions, 'updateQueueStatus');
      await callable({ clinicId, doctorId, queueId, newStatus: targetStatus });
      const messageMap: Record<typeof targetStatus, string> = {
        paused: 'Queue paused. Patients cannot be called until resumed.',
        active: 'Queue resumed and set to Active.',
        ended: 'Queue ended. You can restart it if needed.'
      };
      toast.success(messageMap[targetStatus] ?? 'Queue updated');
      return true;
    } catch (error) {
      console.error('Failed to update queue status', error);
      toast.error(getErrorMessage(error, 'Failed to update queue status. Please try again.'));
      if (previousQueue) {
        queryClient.setQueryData(queueDocQueryKey, previousQueue);
      }
      return false;
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleQueueStatusEvent = useCallback((mode: 'pause' | 'resume' | 'end' | 'restart', targetStatus: 'paused' | 'active' | 'ended') => {
    if (isReadOnly) {
      toast.error('This queue is read-only for the selected date.');
      return;
    }
    if (!clinicId || !doctorId) {
      toast.error('Clinic or doctor selection missing.');
      return;
    }
    setStatusDialog({ mode, targetStatus });
  }, [clinicId, doctorId, isReadOnly]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleTogglePause = () => {
      if (queueStatus === 'paused') {
        handleQueueStatusEvent('resume', 'active');
      } else {
        handleQueueStatusEvent('pause', 'paused');
      }
    };
    const handleEnd = () => handleQueueStatusEvent('end', 'ended');
    const handleRestart = () => handleQueueStatusEvent('restart', 'active');

    window.addEventListener('togglePauseQueue', handleTogglePause);
    window.addEventListener('endQueue', handleEnd);
    window.addEventListener('restartQueue', handleRestart);
    return () => {
      window.removeEventListener('togglePauseQueue', handleTogglePause);
      window.removeEventListener('endQueue', handleEnd);
      window.removeEventListener('restartQueue', handleRestart);
    };
  }, [queueStatus, clinicId, doctorId, queueId, isReadOnly, handleQueueStatusEvent]);
  const handleCallPatient = (patientId: string) => {
    if (!clinicId || !doctorId || !queueId) return;
    if (queueInactive) {
      toast.error('Queue is not active. Resume it before calling patients.');
      return;
    }
    setLoadingPatientIds(prev => new Set(prev).add(patientId));
    
    callPatientMutation.mutate(patientId, {
      onSettled: () => {
        setLoadingPatientIds(prev => {
          const next = new Set(prev);
          next.delete(patientId);
          return next;
        });
      }
    });
  };

  const requestCompletePatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    setCompletePatientId(patientId);
    setCompletePatientName(p?.name || null);
    setShowCompleteModal(true);
  };

  const handleCompletePatient = () => {
    if (!clinicId || !doctorId || !queueId || !completePatientId) return;
    setIsCompletingPatient(true);
    
    completePatientMutation.mutate(completePatientId, {
      onSettled: () => {
        setIsCompletingPatient(false);
        setShowCompleteModal(false);
      }
    });
  };

  const requestCancelPatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    setCancelPatientId(patientId);
    setCancelPatientName(p?.name || null);
    setShowCancelModal(true);
  };

  const handleCancelPatient = () => {
    if (!clinicId || !doctorId || !queueId || !cancelPatientId) return;
    setIsCancellingPatient(true);
    
    cancelPatientMutation.mutate(cancelPatientId, {
      onSettled: () => {
        setIsCancellingPatient(false);
        setShowCancelModal(false);
      }
    });
  };

  const requestUncallPatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    setUncallPatientId(patientId);
    setUncallPatientName(p?.name || null);
    setShowUncallModal(true);
  };

  const handleUncallPatient = () => {
    if (!clinicId || !doctorId || !queueId || !uncallPatientId) return;
    setIsUncallingPatient(true);
    
    uncallPatientMutation.mutate(uncallPatientId, {
      onSettled: () => {
        setIsUncallingPatient(false);
        setShowUncallModal(false);
      }
    });
  };

  const handleNextPatient = useCallback(async () => {
    if (!clinicId || !doctorId || !queueId) {
      toast.error('Missing clinic or doctor information.');
      return;
    }

    if (queueInactive) {
      toast.error('Queue is not active. Resume it before advancing.');
      return;
    }

    const currentPatient = patients.find((patient) => patient.status === 'in-progress') ?? null;
    const nextPatient = patients.find((patient) => patient.status === 'waiting') ?? null;

    if (!currentPatient && !nextPatient) {
      toast.info('No patients to advance.');
      setShowAdvanceModal(false);
      return;
    }

    setIsNextPatientLoading(true);

    const cachedPatients = queryClient.getQueryData<Patient[] | undefined>(patientsQueryKey);
    const previousPatients = cachedPatients ?? patients;
    const hadPatientsCache = cachedPatients !== undefined;
    const previousQueue = queryClient.getQueryData<DashboardQueue | null>(queueDocQueryKey);

    const optimisticPatients = previousPatients.map((patient) => {
      if (currentPatient && patient.id === currentPatient.id) {
        return { ...patient, status: 'completed' };
      }
      if (nextPatient && patient.id === nextPatient.id) {
        return { ...patient, status: 'in-progress' };
      }
      return patient;
    });

    queryClient.setQueryData(patientsQueryKey, optimisticPatients);

    if (previousQueue) {
      const baseCompleted = typeof previousQueue.completedPatients === 'number' ? previousQueue.completedPatients : 0;
      const queueAfterComplete: DashboardQueue = {
        ...previousQueue,
        completedPatients: currentPatient ? baseCompleted + 1 : baseCompleted,
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

      queryClient.setQueryData(queueDocQueryKey, queueAfterCall);
    }

    try {
      const advanceQueue = httpsCallable(functions, 'advanceQueue');
      await advanceQueue({ clinicId, doctorId, queueId });

      if (nextPatient) {
        toast.success(`${nextPatient.name || 'Patient'} (Token #${nextPatient.tokenNumber}) has been called`);
      } else {
        toast.info('No patients to advance.');
      }

      setShowAdvanceModal(false);
    } catch (error) {
      if (previousQueue) {
        queryClient.setQueryData(queueDocQueryKey, previousQueue);
      }

      if (hadPatientsCache) {
        queryClient.setQueryData(patientsQueryKey, previousPatients);
      } else {
        queryClient.removeQueries({ queryKey: patientsQueryKey, exact: true });
      }

      console.error('Error advancing queue:', error);
      toast.error(getErrorMessage(error, 'Failed to advance queue'));
    } finally {
      setIsNextPatientLoading(false);
    }
  }, [clinicId, doctorId, queueId, queueInactive, patients, patientsQueryKey, queryClient, queueDocQueryKey]);

  // Render patient action buttons
  const PatientActions = ({ patient }: { patient: Patient }) => {
    const isInProgress = patient.status === 'in-progress';
    const isCompleted = patient.status === 'completed';
    const isCancelled = patient.status === 'cancelled';
  const canCall = !isCompleted && !isCancelled && patient.status === 'waiting' && !queueInactive;
    const canComplete = isInProgress && !isCompleted;
    const canCancel = !isCompleted && !isCancelled;
    const canUncall = isInProgress && !isCompleted && !isCancelled;
    const isLoading = loadingPatientIds.has(patient.id);

    if (isReadOnly) return null;

    return (
      <div className="flex items-center justify-center gap-1">
        {canCall && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCallPatient(patient.id)}
            disabled={isLoading}
            className="h-8 px-2 hover:bg-accent"
            title="Call Patient"
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            )}
          </Button>
        )}
        {canComplete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => requestCompletePatient(patient.id)}
            disabled={isLoading}
            className="h-8 px-2 hover:bg-accent text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400"
            title="Mark Complete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </Button>
        )}
        {canUncall && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => requestUncallPatient(patient.id)}
            disabled={isLoading}
            className="h-8 px-2 hover:bg-accent"
            title="Return to Waiting"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </Button>
        )}
        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => requestCancelPatient(patient.id)}
            disabled={isLoading}
            className="h-8 px-2 hover:bg-accent text-muted-foreground hover:text-destructive"
            title="Cancel Patient"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        )}
      </div>
    );
  };

  // Sort and group patients
  const sorted = [...patients].sort((a, b) => a.tokenNumber - b.tokenNumber);
  const groups: Record<string, Patient[]> = {
    'in-progress': [],
    waiting: [],
    completed: [],
    cancelled: []
  };
  sorted.forEach(p => { groups[p.status]?.push(p); });
  
  const waitingPatients = groups.waiting;
  const inProgressPatients = groups['in-progress'];
  const completedPatients = groups.completed;
  const cancelledPatients = groups.cancelled;

  if (loadingPatients) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-1/3 rounded bg-muted" />
                <div className="h-4 w-1/4 rounded bg-muted" />
              </div>
              <div className="h-9 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (realtimeError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
        {realtimeError}
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="max-w-sm mx-auto space-y-4">
          <div className="h-14 w-14 mx-auto rounded-lg bg-muted flex items-center justify-center">
            <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">No Patients Yet</h3>
            <p className="text-sm text-muted-foreground">Patients who join the queue will appear here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dialogs */}
      <AlertDialog open={showCompleteModal} onOpenChange={setShowCompleteModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Patient Visit?</AlertDialogTitle>
            <AlertDialogDescription>
              Mark <strong>{completePatientName}</strong> as completed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCompletingPatient}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCompletePatient} disabled={isCompletingPatient}>
              {isCompletingPatient ? 'Completing...' : 'Complete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Patient?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel <strong>{cancelPatientName}</strong>&apos;s appointment. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancellingPatient}>No, Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelPatient} disabled={isCancellingPatient}>
              {isCancellingPatient ? 'Cancelling...' : 'Yes, Cancel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUncallModal} onOpenChange={setShowUncallModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Patient to Waiting?</AlertDialogTitle>
            <AlertDialogDescription>
              Return <strong>{uncallPatientName}</strong> back to the waiting list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUncallingPatient}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUncallPatient} disabled={isUncallingPatient}>
              {isUncallingPatient ? 'Returning...' : 'Return to Waiting'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showAdvanceModal} onOpenChange={setShowAdvanceModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Call Next Patient?</AlertDialogTitle>
            <AlertDialogDescription>
              This will call the next waiting patient.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleNextPatient()} disabled={queueInactive || isNextPatientLoading}>
              {isNextPatientLoading ? 'Calling...' : 'Call Next'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={statusDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStatusDialog(null);
            setEndConfirmText('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusDialog?.mode === 'pause' && 'Pause Today\'s Queue?'}
              {statusDialog?.mode === 'resume' && 'Resume Queue?'}
              {statusDialog?.mode === 'end' && 'End Today\'s Queue?'}
              {statusDialog?.mode === 'restart' && 'Restart Queue?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusDialog?.mode === 'pause' && 'Pausing stops calling patients until you resume the queue.'}
              {statusDialog?.mode === 'resume' && 'Resume the queue so you can call and complete patients again.'}
              {statusDialog?.mode === 'end' && (
                <>
                  Ending the queue prevents further calls today. Patients can still join but remain waiting. Type <span className="font-semibold">END</span> to confirm.
                </>
              )}
              {statusDialog?.mode === 'restart' && 'Set the queue status back to Active and continue operations.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {statusDialog?.mode === 'end' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="confirm-end-input">
                Type END to confirm
              </label>
              <input
                id="confirm-end-input"
                value={endConfirmText}
                onChange={(e) => setEndConfirmText(e.target.value)}
                placeholder="END"
                className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
                autoFocus
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!statusDialog) return;
                if (statusDialog.mode === 'end' && endConfirmText !== 'END') return;
                const ok = await updateQueueStatus(statusDialog.targetStatus);
                if (ok) {
                  setStatusDialog(null);
                  setEndConfirmText('');
                }
              }}
              disabled={statusUpdating || (statusDialog?.mode === 'end' && endConfirmText !== 'END')}
            >
              {statusUpdating
                ? 'Updating...'
                : statusDialog?.mode === 'pause'
                  ? 'Pause Queue'
                  : statusDialog?.mode === 'resume'
                    ? 'Resume Queue'
                    : statusDialog?.mode === 'end'
                      ? 'Confirm End'
                      : 'Restart Queue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isReadOnly && (
        <div className="flex items-start gap-3 text-sm text-muted-foreground bg-muted border border-border rounded-lg px-4 py-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-medium">Viewing historical queue data for </span>
            <span className="font-mono text-foreground">{queueId}</span>
            <span>. Actions are disabled.</span>
          </div>
        </div>
      )}

      {/* Tabbed View - Desktop & Mobile */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger value="active" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 py-3">
            <span className="font-semibold">Active</span>
            <Badge variant="outline" className="ml-2 font-medium">
              {inProgressPatients.length + waitingPatients.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 py-3">
            <span className="font-semibold">Completed</span>
            <Badge variant="outline" className="ml-2 font-medium">
              {completedPatients.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 py-3">
            <span className="font-semibold">Cancelled</span>
            <Badge variant="outline" className="ml-2 font-medium">
              {cancelledPatients.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Active Tab - In Progress + Waiting */}
        <TabsContent value="active" className="mt-0">
          {/* Desktop Table */}
          <div className="hidden lg:block border rounded-b-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-20 font-semibold pl-6 pr-4 text-center">Token</TableHead>
                  <TableHead className="font-semibold px-4 text-center">Name</TableHead>
                  <TableHead className="w-24 font-semibold px-4 text-center">Age</TableHead>
                  <TableHead className="hidden xl:table-cell font-semibold px-4 text-center">Phone</TableHead>
                  <TableHead className="w-36 font-semibold px-4 text-center">Actions</TableHead>
                  <TableHead className="w-32 font-semibold px-4 text-center">Status</TableHead>
                  <TableHead className="w-28 font-semibold pl-4 pr-6 text-center">Wait Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
            {/* In Progress */}
            {inProgressPatients.map((patient) => (
              <TableRow key={patient.id} className="bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/40 border-l-4 border-l-blue-500">
                <TableCell className="font-bold text-base py-3 pl-6 pr-4 text-center">{patient.tokenNumber}</TableCell>
                <TableCell className="font-medium py-3 px-4 text-center">{patient.name}</TableCell>
                <TableCell className="text-muted-foreground py-3 px-4 text-center">{formatAge(patient.age)}</TableCell>
                <TableCell className="hidden xl:table-cell text-muted-foreground py-3 px-4 text-center">{formatPhone(patient.phone)}</TableCell>
                <TableCell className="py-3 px-4 text-center">
                  <PatientActions patient={patient} />
                </TableCell>
                <TableCell className="py-3 px-4 text-center">
                  <Badge className="bg-blue-500 text-white hover:bg-blue-600 font-medium border-0">
                    In Progress
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground font-medium py-3 pl-4 pr-6 text-center">{getWaitTime(patient.joinedAt)}</TableCell>
              </TableRow>
            ))}
            {/* Waiting */}
            {waitingPatients.map((patient) => (
              <TableRow key={patient.id} className="hover:bg-muted/20">
                <TableCell className="font-bold text-base py-3 pl-6 pr-4 text-center">{patient.tokenNumber}</TableCell>
                <TableCell className="font-medium py-3 px-4 text-center">{patient.name}</TableCell>
                <TableCell className="text-muted-foreground py-3 px-4 text-center">{formatAge(patient.age)}</TableCell>
                <TableCell className="hidden xl:table-cell text-muted-foreground py-3 px-4 text-center">{formatPhone(patient.phone)}</TableCell>
                <TableCell className="py-3 px-4 text-center">
                  <PatientActions patient={patient} />
                </TableCell>
                <TableCell className="py-3 px-4 text-center">
                  <Badge className="bg-amber-500 text-white hover:bg-amber-600 font-medium border-0">Waiting</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground font-medium py-3 pl-4 pr-6 text-center">{getWaitTime(patient.joinedAt)}</TableCell>
              </TableRow>
            ))}
            
            {inProgressPatients.length === 0 && waitingPatients.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center px-4">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="font-medium">No active patients</p>
                    <p className="text-sm">Patients will appear here when they join the queue</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View - Active */}
      <div className="lg:hidden space-y-4 pt-4">
        {/* In Progress */}
        {inProgressPatients.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-2">
              <div className="h-1 w-1 rounded-full bg-blue-500"></div>
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">In Progress</h4>
            </div>
            {inProgressPatients.map((patient) => (
              <div key={patient.id} className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-l-blue-500 border border-border rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center font-bold text-base">
                      {patient.tokenNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-base mb-1">{patient.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <span>{formatAge(patient.age)}</span>
                        <span>•</span>
                        <span className="font-medium">{getWaitTime(patient.joinedAt)}</span>
                      </div>
                      <Badge className="bg-blue-500 text-white hover:bg-blue-600 font-medium border-0">
                        In Progress
                      </Badge>
                    </div>
                  </div>
                  <PatientActions patient={patient} />
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Waiting */}
        {waitingPatients.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-2">
              <div className="h-1 w-1 rounded-full bg-amber-500"></div>
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Waiting ({waitingPatients.length})</h4>
            </div>
            {waitingPatients.map((patient) => (
              <div key={patient.id} className="bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center font-bold text-base">
                      {patient.tokenNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-base mb-1">{patient.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <span>{formatAge(patient.age)}</span>
                        <span>•</span>
                        <span className="font-medium">{getWaitTime(patient.joinedAt)}</span>
                      </div>
                      <Badge className="bg-amber-500 text-white hover:bg-amber-600 font-medium border-0">Waiting</Badge>
                    </div>
                  </div>
                  <PatientActions patient={patient} />
                </div>
              </div>
            ))}
          </div>
        )}

        {inProgressPatients.length === 0 && waitingPatients.length === 0 && (
          <div className="py-12 text-center">
            <div className="max-w-sm mx-auto space-y-3">
              <svg className="w-12 h-12 mx-auto text-muted-foreground opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <div>
                <h3 className="font-semibold text-foreground">No active patients</h3>
                <p className="text-sm text-muted-foreground mt-1">Patients will appear here when they join the queue</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </TabsContent>

    {/* Completed Tab */}
    <TabsContent value="completed" className="mt-0">
      {/* Desktop Table */}
      <div className="hidden lg:block border rounded-b-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-20 font-semibold pl-6 pr-4 text-center">Token</TableHead>
              <TableHead className="font-semibold px-4 text-center">Name</TableHead>
              <TableHead className="w-24 font-semibold px-4 text-center">Age</TableHead>
              <TableHead className="hidden xl:table-cell font-semibold px-4 text-center">Phone</TableHead>
              <TableHead className="w-36 font-semibold px-4 text-center">Actions</TableHead>
              <TableHead className="w-32 font-semibold px-4 text-center">Status</TableHead>
              <TableHead className="w-28 font-semibold pl-4 pr-6 text-center">Wait Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {completedPatients.map((patient) => (
              <TableRow key={patient.id} className="opacity-60 hover:opacity-80">
                <TableCell className="font-bold text-base py-3 pl-6 pr-4 text-center">{patient.tokenNumber}</TableCell>
                <TableCell className="font-medium line-through py-3 px-4 text-center">{patient.name}</TableCell>
                <TableCell className="text-muted-foreground py-3 px-4 text-center">{formatAge(patient.age)}</TableCell>
                <TableCell className="hidden xl:table-cell text-muted-foreground py-3 px-4 text-center">{formatPhone(patient.phone)}</TableCell>
                <TableCell className="py-3 px-4 text-center"></TableCell>
                <TableCell className="py-3 px-4 text-center">
                  <Badge className="bg-green-500 text-white font-medium border-0">Completed</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground font-medium py-3 pl-4 pr-6 text-center">{getWaitTime(patient.joinedAt)}</TableCell>
              </TableRow>
            ))}
            {completedPatients.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center px-4">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="font-medium">No completed patients</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3 pt-4">
        {completedPatients.map((patient) => (
          <div key={patient.id} className="bg-muted/20 border border-border rounded-lg p-4 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center font-bold text-base">
                {patient.tokenNumber}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-base mb-1 line-through">{patient.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatAge(patient.age)}</span>
                  <span>•</span>
                  <span className="font-medium">{getWaitTime(patient.joinedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {completedPatients.length === 0 && (
          <div className="py-12 text-center">
            <div className="max-w-sm mx-auto space-y-3">
              <svg className="w-12 h-12 mx-auto text-muted-foreground opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h3 className="font-semibold text-foreground">No completed patients</h3>
                <p className="text-sm text-muted-foreground mt-1">Completed patients will appear here</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </TabsContent>

    {/* Cancelled Tab */}
    <TabsContent value="cancelled" className="mt-0">
      {/* Desktop Table */}
      <div className="hidden lg:block border rounded-b-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-20 font-semibold pl-6 pr-4 text-center">Token</TableHead>
              <TableHead className="font-semibold px-4 text-center">Name</TableHead>
              <TableHead className="w-24 font-semibold px-4 text-center">Age</TableHead>
              <TableHead className="hidden xl:table-cell font-semibold px-4 text-center">Phone</TableHead>
              <TableHead className="w-36 font-semibold px-4 text-center">Actions</TableHead>
              <TableHead className="w-32 font-semibold px-4 text-center">Status</TableHead>
              <TableHead className="w-28 font-semibold pl-4 pr-6 text-center">Wait Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cancelledPatients.map((patient) => (
              <TableRow key={patient.id} className="opacity-60 hover:opacity-80">
                <TableCell className="font-bold text-base py-3 pl-6 pr-4 text-center">{patient.tokenNumber}</TableCell>
                <TableCell className="font-medium line-through py-3 px-4 text-center">{patient.name}</TableCell>
                <TableCell className="text-muted-foreground py-3 px-4 text-center">{formatAge(patient.age)}</TableCell>
                <TableCell className="hidden xl:table-cell text-muted-foreground py-3 px-4 text-center">{formatPhone(patient.phone)}</TableCell>
                <TableCell className="py-3 px-4 text-center"></TableCell>
                <TableCell className="py-3 px-4 text-center">
                  <Badge className="bg-red-500 text-white font-medium border-0">Cancelled</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground font-medium py-3 pl-4 pr-6 text-center">{getWaitTime(patient.joinedAt)}</TableCell>
              </TableRow>
            ))}
            {cancelledPatients.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center px-4">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <p className="font-medium">No cancelled patients</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3 pt-4">
        {cancelledPatients.map((patient) => (
          <div key={patient.id} className="bg-muted/20 border border-border rounded-lg p-4 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center font-bold text-base">
                {patient.tokenNumber}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-base mb-1 line-through">{patient.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatAge(patient.age)}</span>
                  <span>•</span>
                  <span className="font-medium">{getWaitTime(patient.joinedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {cancelledPatients.length === 0 && (
          <div className="py-12 text-center">
            <div className="max-w-sm mx-auto space-y-3">
              <svg className="w-12 h-12 mx-auto text-muted-foreground opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <div>
                <h3 className="font-semibold text-foreground">No cancelled patients</h3>
                <p className="text-sm text-muted-foreground mt-1">Cancelled patients will appear here</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </TabsContent>

  </Tabs>
    </div>
  );
}
