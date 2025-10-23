'use client';

import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { db, functions } from '../lib/firebase';
import { markPhase, queueProfilingEnabled, recordRender, recordSnapshot } from '../lib/profiling';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Separator } from './ui/separator';

interface Patient {
  id: string;
  tokenNumber: number;
  name: string;
  age: number;
  phone: string;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled';
  joinedAt: Date | { seconds: number; nanoseconds: number };
  queueId: string;
}

export interface QueueListProps {
  clinicId?: string;
  doctorId?: string;
  queueStatus?: 'active' | 'paused' | 'ended' | 'closed';
  dayKey: string; // new required prop representing YYYY-MM-DD of queue
  compact?: boolean; // compact density rows
  autoAdvance?: boolean;
}

export default function QueueList({ clinicId: clinicIdProp, doctorId: doctorIdProp, queueStatus, dayKey, compact = true, autoAdvance: autoAdvanceProp = true }: QueueListProps) {
  const renderLabel = useMemo(() => {
    const clinic = clinicIdProp ?? 'clinic?';
    const doctor = doctorIdProp ?? 'doctor?';
    return `QueueList:${clinic}:${doctor}:${dayKey}`;
  }, [clinicIdProp, doctorIdProp, dayKey]);
  const renderStart = queueProfilingEnabled ? performance.now() : 0;
  const snapshotTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!queueProfilingEnabled) return;
    const duration = performance.now() - renderStart;
    recordRender(renderLabel, duration);
  }, [renderLabel, renderStart]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState<boolean>(true);
  const [isNextPatientLoading, setIsNextPatientLoading] = useState(false);
  const [isPauseQueueLoading, setIsPauseQueueLoading] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(autoAdvanceProp);
  const [isAutoAdvUpdating, setIsAutoAdvUpdating] = useState<boolean>(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [endConfirmText, setEndConfirmText] = useState('');
  // Cancel patient modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPatientId, setCancelPatientId] = useState<string | null>(null);
  const [isCancellingPatient, setIsCancellingPatient] = useState(false);
  // Uncall patient modal state
  const [showUncallModal, setShowUncallModal] = useState(false);
  const [uncallPatientId, setUncallPatientId] = useState<string | null>(null);
  const [isUncallingPatient, setIsUncallingPatient] = useState(false);
  // Complete patient modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completePatientId, setCompletePatientId] = useState<string | null>(null);
  const [completePatientName, setCompletePatientName] = useState<string | null>(null);
  const [isCompletingPatient, setIsCompletingPatient] = useState(false);
  // Track names for existing modals
  const [cancelPatientName, setCancelPatientName] = useState<string | null>(null);
  const [uncallPatientName, setUncallPatientName] = useState<string | null>(null);
  // Track individual button loading states
  const [loadingPatientIds, setLoadingPatientIds] = useState<Set<string>>(new Set());
  // Advance & Pause confirmation modals
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  // Skip-confirm preferences (per day)
  const [skipAdvanceToday, setSkipAdvanceToday] = useState(false);
  const [skipPauseToday, setSkipPauseToday] = useState(false);

  const activeActionMessage = useMemo(() => {
    if (isPauseQueueLoading) {
      return queueStatus === 'paused' ? 'Resuming queue…' : 'Pausing queue…';
    }
    if (isNextPatientLoading) {
      return 'Advancing queue…';
    }
    if (isCompletingPatient) {
      return 'Completing patient…';
    }
    if (isCancellingPatient) {
      return 'Cancelling patient…';
    }
    if (isUncallingPatient) {
      return 'Reverting patient to waiting…';
    }
    if (isAutoAdvUpdating) {
      return 'Saving auto-advance preference…';
    }
    return null;
  }, [
    isPauseQueueLoading,
    queueStatus,
    isNextPatientLoading,
    isCompletingPatient,
    isCancellingPatient,
    isUncallingPatient,
    isAutoAdvUpdating
  ]);

  // Load skip preferences once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const todayKey = new Date().toISOString().split('T')[0];
    try {
      const adv = localStorage.getItem(`wf_skip_adv_${todayKey}`);
      const pau = localStorage.getItem(`wf_skip_pause_${todayKey}`);
      setSkipAdvanceToday(adv === '1');
      setSkipPauseToday(pau === '1');
    } catch (e) {
      console.warn('Failed reading skip prefs', e);
    }
  }, []);

  // Use props as provided by parent. If missing, do not subscribe.
  const clinicId = clinicIdProp;
  const doctorId = doctorIdProp;
  const queueId = dayKey; // previously today

  useEffect(() => {
    setAutoAdvance(autoAdvanceProp);
  }, [autoAdvanceProp]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!clinicId || !doctorId) {
      setPatients([]);
      setLoadingPatients(false);
      return;
    }

    setLoadingPatients(true);

    const patientsRef = collection(
      db,
      'clinics',
      clinicId,
      'doctors',
      doctorId,
      'queues',
      queueId,
      'patients'
    );

    const unsubscribe = onSnapshot(
      query(patientsRef),
      (snapshot) => {
        const start = queueProfilingEnabled ? performance.now() : 0;
        const patientsList: Patient[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<Patient, 'id'>;
          return { id: docSnap.id, ...data };
        });
        setPatients(patientsList);
        setLoadingPatients(false);
        if (queueProfilingEnabled) {
          const end = performance.now();
          const sinceLast = snapshotTimerRef.current != null ? end - snapshotTimerRef.current : 0;
          const processing = end - start;
          recordSnapshot(`${renderLabel}:patients`, {
            size: snapshot.size,
            latencyMs: sinceLast || processing,
          });
          snapshotTimerRef.current = end;
        }
      },
      (error) => {
        console.error('[QueueList] Failed to subscribe to patients', error);
        toast.error('Failed to load patients. Please try refreshing the page.');
        setLoadingPatients(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [clinicId, doctorId, queueId, renderLabel]);

  const isToday = (() => {
    try { return new Date().toISOString().split('T')[0] === queueId; } catch { return false; }
  })();
  const isReadOnly = !isToday || queueStatus === 'closed';

  // Guard mutating handlers if read-only
  const guarded = <Args extends unknown[], Return>(fn: (...args: Args) => Return) => {
    return (...args: Args): Return | undefined => {
      if (isReadOnly) {
        toast.error('This queue is read-only for the selected date.');
        return undefined;
      }
      return fn(...args);
    };
  };

  // Wrap existing handlers (only those modifying data)
  const handleNextPatient = guarded(async () => {
    if (queueStatus === 'paused') {
      toast.error('Queue is paused. Resume it before advancing.');
      return;
    }
    setIsNextPatientLoading(true);
    const phaseLabel = `${renderLabel}:advance`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      // Get callable reference to updatePatientStatus function
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');

      // Step 1: Find and complete the current patient (in-progress)
      const currentPatient = patients.find(patient => patient.status === 'in-progress');
      if (currentPatient) {
        console.log('Completing current patient:', currentPatient.name);
        
        await updatePatientStatus({
          clinicId,
          doctorId,
          queueId,
          patientId: currentPatient.id,
          newStatus: 'completed'
        });

        console.log('Current patient completed successfully');
      }

      // Step 2: Find and call the next patient (waiting)
      const nextPatient = patients.find(patient => patient.status === 'waiting');
      if (nextPatient) {
        console.log('Calling next patient:', nextPatient.name);
        
        await updatePatientStatus({
          clinicId,
          doctorId,
          queueId,
          patientId: nextPatient.id,
          newStatus: 'in-progress'
        });

        console.log('Next patient called successfully');
        toast.success(`${nextPatient.name} (Token #${nextPatient.tokenNumber}) has been called`);
      } else {
        console.log('No waiting patients found');
      }

      if (!currentPatient && !nextPatient) {
        console.log('No patients available to process');
        toast.info('No patients to advance.');
      }

    } catch (error) {
      console.error('Error updating patient status:', error);
      toast.error('Failed to advance patient. Please try again.');
    } finally {
      setIsNextPatientLoading(false);
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  });

  // Handler for "Pause Queue" button
  const handleTogglePauseQueue = guarded(async () => {
    setIsPauseQueueLoading(true);
    const phaseLabel = `${renderLabel}:pause`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      console.log('Toggling queue pause status');

      if (!clinicId || !doctorId) {
        throw new Error('Missing clinic or doctor identifier');
      }

      const target = queueStatus === 'paused' ? 'active' : 'paused';
      const queueDocRef = doc(
        db,
        'clinics',
        clinicId!,
        'doctors',
        doctorId!,
        'queues',
        queueId
      );

      await updateDoc(queueDocRef, {
        status: target,
        updatedAt: serverTimestamp()
      });

      console.log('Queue status updated successfully via direct write', { queueId, newStatus: target });
      toast.success(`Queue ${target === 'paused' ? 'paused' : 'resumed'}`);
    } catch (error) {
      console.error('Error updating queue status:', error);
      toast.error('Failed to update queue status. Please try again.');
    } finally {
      setIsPauseQueueLoading(false);
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  });

  const requestCompletePatient = (patientId: string) => {
    if (!patientId) return;
    const p = patients.find(pt => pt.id === patientId);
    setCompletePatientId(patientId);
    setCompletePatientName(p?.name || null);
    setShowCompleteModal(true);
  };
  const confirmCompletePatient = async () => {
    if (!completePatientId) return;
    setIsCompletingPatient(true);
    setLoadingPatientIds(prev => new Set(prev).add(completePatientId));
    
    const phaseLabel = `${renderLabel}:complete`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId: completePatientId, newStatus: 'completed' });
      toast.success(autoAdvance ? 'Patient completed. Next patient will be called automatically.' : 'Patient marked as completed');
      setShowCompleteModal(false);
      setCompletePatientId(null);
      setCompletePatientName(null);
    } catch (e) {
      console.error('Complete patient failed', e);
      toast.error('Failed to complete patient. Please try again.');
    } finally {
      setIsCompletingPatient(false);
      setLoadingPatientIds(prev => {
        const next = new Set(prev);
        next.delete(completePatientId);
        return next;
      });
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  };

  // Toggle autoAdvance on server
  const handleToggleAutoAdvance = guarded(async (checked: boolean) => {
    setIsAutoAdvUpdating(true);
    const phaseLabel = `${renderLabel}:auto-advance`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      if (!clinicId || !doctorId) {
        throw new Error('Missing clinic or doctor identifier');
      }
      const queueDocRef = doc(
        db,
        'clinics',
        clinicId!,
        'doctors',
        doctorId!,
        'queues',
        queueId
      );
      await setDoc(queueDocRef, { autoAdvance: checked, updatedAt: serverTimestamp() }, { merge: true });
      // optimistic update; real value will flow from queue doc listener too
      setAutoAdvance(checked);
    } catch (e) {
      console.error('Failed to set autoAdvance', e);
      toast.error('Failed to update auto-advance setting. Please try again.');
    } finally {
      setIsAutoAdvUpdating(false);
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  });

  const handleCallPatient = guarded(async (patientId: string) => {
    if (!patientId) return;
    if (queueStatus === 'paused') { 
      toast.error('Queue is paused. Resume it first.'); 
      return; 
    }
    const phaseLabel = `${renderLabel}:call`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    
    // Add to loading set
    setLoadingPatientIds(prev => new Set(prev).add(patientId));
    
    try {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId, newStatus: 'in-progress' });
      const patient = patients.find(p => p.id === patientId);
      toast.success(`${patient?.name || 'Patient'} has been called`);
    } catch (e) {
      console.error('Call patient failed', e);
      toast.error('Failed to call patient. Please try again.');
    } finally {
      // Remove from loading set
      setLoadingPatientIds(prev => {
        const next = new Set(prev);
        next.delete(patientId);
        return next;
      });
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  });

  // (removed deprecated direct cancel handler)
  const requestCancelPatient = (patientId: string) => {
    if (!patientId) return;
    const p = patients.find(pt => pt.id === patientId);
    setCancelPatientId(patientId);
    setCancelPatientName(p?.name || null);
    setShowCancelModal(true);
  };
  const confirmCancelPatient = async () => {
    if (!cancelPatientId) return;
    setIsCancellingPatient(true);
    setLoadingPatientIds(prev => new Set(prev).add(cancelPatientId));
    
    const phaseLabel = `${renderLabel}:cancel`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId: cancelPatientId, newStatus: 'cancelled' });
      const patient = patients.find(p => p.id === cancelPatientId);
      toast.success(`${patient?.name || 'Patient'} has been cancelled`);
      setShowCancelModal(false);
      setCancelPatientId(null);
    } catch (e) {
      console.error('Cancel patient failed', e);
      toast.error('Failed to cancel patient. Please try again.');
    } finally {
      setIsCancellingPatient(false);
      setLoadingPatientIds(prev => {
        const next = new Set(prev);
        next.delete(cancelPatientId);
        return next;
      });
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  };
  // Request uncall patient (revert in-progress -> waiting)
  const requestUncallPatient = (patientId: string) => {
    if (!patientId) return;
    const p = patients.find(pt => pt.id === patientId);
    setUncallPatientId(patientId);
    setUncallPatientName(p?.name || null);
    setShowUncallModal(true);
  };
  const confirmUncallPatient = async () => {
    if (!uncallPatientId) return;
    setIsUncallingPatient(true);
    setLoadingPatientIds(prev => new Set(prev).add(uncallPatientId));
    
    const phaseLabel = `${renderLabel}:uncall`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId: uncallPatientId, newStatus: 'waiting' });
      const patient = patients.find(p => p.id === uncallPatientId);
      toast.success(`${patient?.name || 'Patient'} returned to waiting`);
      setShowUncallModal(false);
      setUncallPatientId(null);
    } catch (e) {
      console.error('Uncall patient failed', e);
      toast.error('Failed to return patient to waiting. Please try again.');
    } finally {
      setIsUncallingPatient(false);
      setLoadingPatientIds(prev => {
        const next = new Set(prev);
        next.delete(uncallPatientId);
        return next;
      });
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  };

  const getStatusText = (status: Patient['status']) => {
    switch (status) {
      case 'waiting':
        return 'Waiting';
      case 'in-progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const fullStatus = queueStatus as string | undefined; // explicit widen for TS
  const endedFlag = fullStatus === 'ended';
  const pausedFlag = fullStatus === 'paused';
  const waitingCount = patients.filter(p=>p.status==='waiting').length;

  // Event listeners for header buttons
  useEffect(() => {
    const handleTogglePause = () => {
      if (pausedFlag) {
        handleTogglePauseQueue();
      } else {
        if (skipPauseToday) {
          handleTogglePauseQueue();
        } else {
          setShowPauseModal(true);
        }
      }
    };

    const handleEnd = () => {
      setShowEndModal(true);
    };

    const handleRestart = () => {
      if (!clinicId || !doctorId) {
        console.error('Restart queue failed: missing clinic/doctor');
        toast.error('Failed to restart queue. Missing clinic or doctor information.');
        return;
      }
      const queueDocRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!, 'queues', queueId);
      updateDoc(queueDocRef, { status: 'active', updatedAt: serverTimestamp() })
        .then(() => { 
          toast.success('Queue restarted and set to Active'); 
        })
        .catch(e => { 
          console.error('Restart queue failed', e); 
          toast.error('Failed to restart queue. Please try again.'); 
        });
    };

    window.addEventListener('togglePauseQueue', handleTogglePause);
    window.addEventListener('endQueue', handleEnd);
    window.addEventListener('restartQueue', handleRestart);

    return () => {
      window.removeEventListener('togglePauseQueue', handleTogglePause);
      window.removeEventListener('endQueue', handleEnd);
      window.removeEventListener('restartQueue', handleRestart);
    };
  }, [pausedFlag, skipPauseToday, clinicId, doctorId, queueId, handleTogglePauseQueue]);

  return (
  <div className={`space-y-6 w-full px-4 md:px-6 pt-4 md:pt-6 pb-24 md:pb-8 ${compact ? 'queue-compact' : ''}`} aria-live="polite">
      {/* Desktop / tablet toolbar */}
      <div className="hidden sm:flex gap-3 mb-4 flex-wrap">
        {/* Toolbar now minimal since controls moved to section headers */}
      </div>
      {/* Mobile sticky action bar */}
  <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border px-3 py-3 flex items-center gap-2 overflow-x-auto" role="toolbar" aria-label="Queue actions" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 0.75rem)' }}>
        {/* Mobile controls simplified - main controls now in section headers */}
      </div>
      <div className="sm:hidden h-4" />

      {endedFlag && (
        <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-400 mb-2">
          Queue is ended. New patients joining are recorded as waiting but cannot be called until you restart.
        </div>
      )}
      <AlertDialog open={showEndModal && !endedFlag} onOpenChange={(open) => { if (!open) { setShowEndModal(false); setEndConfirmText(''); } else { setShowEndModal(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Today&apos;s Queue?</AlertDialogTitle>
          </AlertDialogHeader>

          <p>You are about to end today&apos;s queue. This will:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Prevent calling or advancing any more patients.</li>
            <li>Allow new patients to still join (they remain Waiting).</li>
            <li>Require a manual restart to resume operations.</li>
          </ul>
          <p className="font-medium text-foreground">Currently waiting: <span className="text-blue-600 dark:text-blue-400">{waitingCount}</span></p>
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type END to confirm</label>
            <input
              autoFocus
              value={endConfirmText}
              onChange={e=>setEndConfirmText(e.target.value)}
              placeholder="END"
              className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowEndModal(false); setEndConfirmText(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if(endConfirmText !== 'END') return;
                if (!clinicId || !doctorId) {
                  console.error('End queue failed: missing clinic/doctor');
                  toast.error('Failed to end queue. Missing clinic or doctor information.');
                  setShowEndModal(false);
                  setEndConfirmText('');
                  return;
                }
                const queueDocRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!, 'queues', queueId);
                updateDoc(queueDocRef, { status: 'ended', updatedAt: serverTimestamp() })
                  .then(()=>{ 
                    toast.success('Queue ended. You can restart it if needed.'); 
                  })
                  .catch(e=>{ 
                    console.error('End queue failed', e); 
                    toast.error('Failed to end queue. Please try again.'); 
                  })
                  .finally(()=>{ setShowEndModal(false); setEndConfirmText(''); });
              }}
              disabled={endConfirmText !== 'END'}
            >
              Confirm End
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelModal} onOpenChange={(open) => { if (!open) { setShowCancelModal(false); setCancelPatientId(null); } else { setShowCancelModal(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Patient?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently mark the patient as cancelled. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(cancelPatientName || cancelPatientId) && (
            <p className="text-xs text-muted-foreground">Patient: <span className="font-mono">{cancelPatientName || cancelPatientId}</span></p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelPatient}>Yes, Cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUncallModal} onOpenChange={(open) => { if (!open) { setShowUncallModal(false); setUncallPatientId(null); } else { setShowUncallModal(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uncall Patient?</AlertDialogTitle>
            <AlertDialogDescription>
              Moves the patient back to Waiting and frees the active slot. Auto-advance is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(uncallPatientName || uncallPatientId) && (
            <p className="text-xs text-muted-foreground">Patient: <span className="font-mono">{uncallPatientName || uncallPatientId}</span></p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUncallPatient}>Yes, Uncall</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCompleteModal} onOpenChange={(open) => { if (!open) { setShowCompleteModal(false); setCompletePatientId(null); setCompletePatientName(null); } else { setShowCompleteModal(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Patient?</AlertDialogTitle>
            <AlertDialogDescription>
              Marks this patient as completed. This increments metrics and (if auto-advance) may call the next patient automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(completePatientName || completePatientId) && (
            <p className="text-xs text-muted-foreground">Patient: <span className="font-mono">{completePatientName || completePatientId}</span></p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCompletePatient}>Yes, Complete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showAdvanceModal} onOpenChange={(open) => { if (!open) { setShowAdvanceModal(false); } else { setShowAdvanceModal(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Advance Queue?</AlertDialogTitle>
          </AlertDialogHeader>
          {(() => {
            const current = patients.find(p=>p.status==='in-progress');
            const next = patients.find(p=>p.status==='waiting');
            return (
              <div className="space-y-2 text-xs">
                <p>This will:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{current ? 'Complete current in-progress patient' : 'No in-progress patient to complete'}</li>
                  <li>{next ? 'Call next waiting patient' : 'No waiting patient to call'}</li>
                </ul>
                <div className="pt-1 space-y-1">
                  <p className="text-muted-foreground">Current: {current ? <span className="font-mono">{current.name} (#{current.tokenNumber})</span> : '—'}</p>
                  <p className="text-muted-foreground">Next: {next ? <span className="font-mono">{next.name} (#{next.tokenNumber})</span> : '—'}</p>
                </div>
              </div>
            );
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async ()=>{ await handleNextPatient(); setShowAdvanceModal(false); }}>Advance</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPauseModal} onOpenChange={(open) => { if (!open) { setShowPauseModal(false); } else { setShowPauseModal(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause Queue?</AlertDialogTitle>
            <AlertDialogDescription>
              Pausing prevents calling or advancing patients until you resume. Current in-progress patient (if any) is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async ()=>{ await handleTogglePauseQueue(); setShowPauseModal(false); }}>Yes, Pause</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeActionMessage && (
        <div className="flex items-center gap-3 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 shadow-sm" role="status">
          <svg className="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="font-medium">{activeActionMessage}</span>
        </div>
      )}

      {isReadOnly && (
        <div className="flex items-start gap-3 text-sm text-muted-foreground bg-muted border border-border rounded-lg px-4 py-3 shadow-sm">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-medium">Viewing historical queue data for </span>
            <span className="font-mono text-foreground">{queueId}</span>
            <span>. Actions are disabled.</span>
          </div>
        </div>
      )}

      {/* Patient List Grouped */}
      {(() => {
        if (loadingPatients) {
          return (
            <div className="space-y-3" aria-hidden>
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
        if (patients.length === 0) {
          return (
            <div className="text-center py-16 px-4">
              <div className="max-w-sm mx-auto space-y-4">
                <div className="h-16 w-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">No Patients Yet</h3>
                  <p className="text-sm text-muted-foreground">Patients who join the queue will appear here</p>
                </div>
              </div>
            </div>
          );
        }
        const sorted = [...patients].sort((a, b) => a.tokenNumber - b.tokenNumber);
        const groups: Record<string, Patient[]> = { 'in-progress': [], waiting: [], completed: [], cancelled: [] };
        sorted.forEach(p => { groups[p.status]?.push(p); });
        const order: Array<keyof typeof groups> = ['in-progress', 'waiting', 'completed', 'cancelled'];
        const titles: Record<string, string> = { 'in-progress': 'In Progress', waiting: 'Waiting', completed: 'Completed', cancelled: 'Cancelled' };
        return order.map(groupKey => {
          const list = groups[groupKey];
          if (!list.length) return null;
          return (
            <div key={groupKey} className="space-y-3">
              {/* Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    groupKey === 'in-progress' ? 'bg-green-100 dark:bg-green-950/30' :
                    groupKey === 'waiting' ? 'bg-blue-100 dark:bg-blue-950/30' :
                    groupKey === 'completed' ? 'bg-muted' :
                    'bg-red-100 dark:bg-red-950/30'
                  }`}>
                    {groupKey === 'in-progress' && (
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {groupKey === 'waiting' && (
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {groupKey === 'completed' && (
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {groupKey === 'cancelled' && (
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">{titles[groupKey]}</h4>
                    <p className="text-xs text-muted-foreground">{list.length} patient{list.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                
                {/* Add controls for waiting section */}
                {groupKey === 'waiting' && !isReadOnly && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={()=>{ if (skipAdvanceToday) { handleNextPatient(); } else { setShowAdvanceModal(true); } }}
                      disabled={isNextPatientLoading || !patients.length || endedFlag || autoAdvance}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-sm h-9 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={autoAdvance ? "Next Patient is automatic when auto-advance is enabled" : "Call the next waiting patient"}
                    >
                      {isNextPatientLoading ? (
                        <>
                          <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing…
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Next Patient
                        </>
                      )}
                    </Button>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-card border border-input rounded-lg hover:bg-accent cursor-pointer transition-colors shadow-sm h-9">
                      <input
                        type="checkbox"
                        checked={autoAdvance}
                        disabled={isAutoAdvUpdating}
                        onChange={(e) => handleToggleAutoAdvance(e.target.checked)}
                        className="h-4 w-4 rounded border-input text-blue-600 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
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
              
              <Separator className="my-2" />
              <div className="space-y-2">
                {list.map(patient => {
                  const isInProgress = patient.status === 'in-progress';
                  const isCompleted = patient.status === 'completed';
                  const isCancelled = patient.status === 'cancelled';
                  const canCall = !isCompleted && !isCancelled && patient.status === 'waiting' && queueStatus !== 'paused' && queueStatus !== 'ended';
                  const canComplete = isInProgress && !isCompleted;
                  const canCancel = !isCompleted && !isCancelled;
                  const canUncall = isInProgress && !isCompleted && !isCancelled;
                  const isLoading = loadingPatientIds.has(patient.id);
                  
                  return (
                    <div
                      key={patient.id}
                      className={`flex flex-col sm:flex-row sm:items-center gap-4 bg-card border rounded-lg p-4 transition-all duration-200 ${
                        isInProgress 
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/20 shadow-sm' 
                          : isCompleted 
                          ? 'border-border bg-muted/50' 
                          : isCancelled
                          ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20'
                          : 'border-border hover:border-border/80 hover:shadow-sm'
                      }`}
                    >
                      {/* Patient Info Section */}
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        {/* Token Number */}
                        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base border-2 ${
                          isInProgress 
                            ? 'bg-blue-100 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300' 
                            : isCompleted
                            ? 'bg-muted border-border text-muted-foreground'
                            : isCancelled
                            ? 'bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'
                            : 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                        }`}>
                          {patient.tokenNumber}
                        </div>

                        {/* Patient Details */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-semibold text-base ${
                              isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}>
                              {patient.name}
                            </p>
                            {isInProgress && (
                              <Badge className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 text-[10px] px-2 py-0.5 font-semibold">
                                NOW
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {patient.age !== undefined && (
                              <span className="flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {patient.age} yrs
                              </span>
                            )}
                            {patient.phone && (
                              <span className="flex items-center gap-1.5 truncate">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                {patient.phone}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge - Desktop */}
                        <div className="hidden sm:block flex-shrink-0">
                          <Badge 
                            variant="outline"
                            className={`text-xs font-medium border ${
                              isInProgress ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700' :
                              isCompleted ? 'bg-muted text-muted-foreground border-border' :
                              isCancelled ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700' :
                              'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                            }`}
                          >
                            {getStatusText(patient.status)}
                          </Badge>
                        </div>
                      </div>

                      {/* Action Buttons Section */}
                      <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                        {canCall && (
                          <Button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCallPatient(patient.id);
                            }}
                            disabled={isLoading}
                            size="sm" 
                            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-sm h-9 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoading ? (
                              <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                            )}
                            {isLoading ? 'Calling...' : 'Call'}
                          </Button>
                        )}
                        {canComplete && (
                          <Button 
                            onClick={(e) => {
                              e.stopPropagation();
                              requestCompletePatient(patient.id);
                            }}
                            disabled={isLoading}
                            variant="default"
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white shadow-sm h-9 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoading ? (
                              <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            Done
                          </Button>
                        )}
                        {canUncall && (
                          <Button 
                            onClick={(e) => {
                              e.stopPropagation();
                              requestUncallPatient(patient.id);
                            }}
                            disabled={isLoading}
                            variant="outline" 
                            size="sm" 
                            className="h-9 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoading ? (
                              <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                            )}
                            Uncall
                          </Button>
                        )}
                        {canCancel && (
                          <Button 
                            onClick={(e) => {
                              e.stopPropagation();
                              requestCancelPatient(patient.id);
                            }}
                            disabled={isLoading}
                            variant="outline" 
                            size="sm" 
                            className="border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-400 dark:hover:border-red-700 h-9 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoading ? (
                              <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}
