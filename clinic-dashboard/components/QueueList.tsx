'use client';

import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, functions } from '../lib/firebase';
import { markPhase, queueProfilingEnabled, recordRender, recordSnapshot } from '../lib/profiling';
import ConfirmModal from './ConfirmModal';
import Button from './ui/Button';

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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        setError('Failed to load patients. Try refreshing the page.');
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
        setError('This queue is read-only for the selected date.');
        return undefined;
      }
      return fn(...args);
    };
  };

  // Wrap existing handlers (only those modifying data)
  const handleNextPatient = guarded(async () => {
    if (queueStatus === 'paused') {
      setError('Queue is paused. Resume it before advancing.');
      return;
    }
    setIsNextPatientLoading(true);
    const phaseLabel = `${renderLabel}:advance`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      setError(null); setMessage(null);
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
      } else {
        console.log('No waiting patients found');
      }

      if (!currentPatient && !nextPatient) {
        console.log('No patients available to process');
        setMessage('No patients to advance.');
      }

    } catch (error) {
      console.error('Error updating patient status:', error);
      setError('Failed to advance patient.');
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

      setMessage(null);
      setError(null);

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
      setMessage(`Queue ${target === 'paused' ? 'paused' : 'resumed'}.`);
      setError(null);
    } catch (error) {
      console.error('Error updating queue status:', error);
      setError('Failed to update queue status.');
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
    const phaseLabel = `${renderLabel}:complete`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      setError(null); setMessage(null);
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId: completePatientId, newStatus: 'completed' });
      setMessage(autoAdvance ? 'Patient completed. (Server auto-advance will call next if any.)' : 'Patient marked completed.');
      setShowCompleteModal(false);
      setCompletePatientId(null);
      setCompletePatientName(null);
    } catch (e) {
      console.error('Complete patient failed', e);
      setError('Failed to complete patient.');
    } finally {
      setIsCompletingPatient(false);
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
      setMessage(null);
      setError(null);
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
      setError('Failed to update auto-advance flag.');
    } finally {
      setIsAutoAdvUpdating(false);
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  });

  const handleCallPatient = guarded(async (patientId: string) => {
    if (!patientId) return;
    if (queueStatus === 'paused') { setError('Queue is paused. Resume first.'); return; }
    const phaseLabel = `${renderLabel}:call`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      setError(null); setMessage(null);
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId, newStatus: 'in-progress' });
      setMessage('Patient called.');
    } catch (e) {
      console.error('Call patient failed', e);
      setError('Failed to call patient.');
    } finally {
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
    const phaseLabel = `${renderLabel}:cancel`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      setError(null); setMessage(null);
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId: cancelPatientId, newStatus: 'cancelled' });
      setMessage('Patient cancelled.');
      setShowCancelModal(false);
      setCancelPatientId(null);
    } catch (e) {
      console.error('Cancel patient failed', e);
      setError('Failed to cancel patient.');
    } finally {
      setIsCancellingPatient(false);
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
    const phaseLabel = `${renderLabel}:uncall`;
    if (queueProfilingEnabled) markPhase(phaseLabel, 'start');
    try {
      setError(null); setMessage(null);
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId: uncallPatientId, newStatus: 'waiting' });
      setMessage('Patient returned to waiting.');
      setShowUncallModal(false);
      setUncallPatientId(null);
    } catch (e) {
      console.error('Uncall patient failed', e);
      setError('Failed to uncall patient.');
    } finally {
      setIsUncallingPatient(false);
      if (queueProfilingEnabled) markPhase(phaseLabel, 'end');
    }
  };

  const getStatusBadgeClasses = (status: Patient['status']) => {
    switch (status) {
      case 'waiting':
        return 'bg-blue-600 text-blue-100';
      case 'in-progress':
        return 'bg-green-600 text-green-100';
      case 'completed':
        return 'bg-gray-600 text-gray-300 line-through';
      case 'cancelled':
        return 'bg-red-600 text-red-100';
      default:
        return 'bg-gray-600 text-gray-300';
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
        setError('Failed to restart queue.');
        return;
      }
      setMessage(null);
      setError(null);
  const queueDocRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!, 'queues', queueId);
      updateDoc(queueDocRef, { status: 'active', updatedAt: serverTimestamp() })
        .then(() => { setMessage('Queue restarted and set to Active.'); setError(null); })
        .catch(e => { console.error('Restart queue failed', e); setError('Failed to restart queue.'); });
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
  <div className={`space-y-3 w-full px-3 md:px-4 lg:px-6 pt-3 md:pt-4 lg:pt-6 pb-32 md:pb-8 ${compact ? 'queue-compact' : ''}`} aria-live="polite">
      {/* Desktop / tablet toolbar */}
      <div className="hidden sm:flex gap-3 mb-4 flex-wrap">
        {/* Toolbar now minimal since controls moved to section headers */}
      </div>
      {/* Mobile sticky action bar */}
  <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 px-3 py-3 flex items-center gap-2 overflow-x-auto" role="toolbar" aria-label="Queue actions" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 0.75rem)' }}>
        {/* Mobile controls simplified - main controls now in section headers */}
      </div>
      <div className="sm:hidden h-4" />

      {endedFlag && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700 mb-2">
          Queue is ended. New patients joining are recorded as waiting but cannot be called until you restart.
        </div>
      )}
      <ConfirmModal
        open={showEndModal && !endedFlag}
        title="End Today's Queue?"
        confirmLabel="Confirm End"
        confirmTone="red"
        onCancel={()=>{ setShowEndModal(false); setEndConfirmText(''); }}
        onConfirm={()=>{
          if(endConfirmText !== 'END') return;
          if (!clinicId || !doctorId) {
            console.error('End queue failed: missing clinic/doctor');
            setError('Failed to end queue.');
            setShowEndModal(false);
            setEndConfirmText('');
            return;
          }
          setMessage(null);
          setError(null);
          const queueDocRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!, 'queues', queueId);
          updateDoc(queueDocRef, { status: 'ended', updatedAt: serverTimestamp() })
            .then(()=>{ setMessage('Queue ended. You can restart it below if needed.'); setError(null); })
            .catch(e=>{ console.error('End queue failed', e); setError('Failed to end queue.'); })
            .finally(()=>{ setShowEndModal(false); setEndConfirmText(''); });
        }}
        disableConfirm={endConfirmText !== 'END'}
        panelClassName="w-full max-w-md rounded-lg bg-white shadow-lg border border-gray-200 p-6 space-y-5"
      >
        <p>You are about to end today&apos;s queue. This will:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>Prevent calling or advancing any more patients.</li>
          <li>Allow new patients to still join (they remain Waiting).</li>
          <li>Require a manual restart to resume operations.</li>
        </ul>
        <p className="font-medium text-gray-700">Currently waiting: <span className="text-blue-700">{waitingCount}</span></p>
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Type END to confirm</label>
          <input
            autoFocus
            value={endConfirmText}
            onChange={e=>setEndConfirmText(e.target.value)}
            placeholder="END"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={showCancelModal}
        title="Cancel Patient?"
        confirmLabel="Yes, Cancel"
        confirmTone="red"
        onCancel={()=>{ if (isCancellingPatient) return; setShowCancelModal(false); setCancelPatientId(null); }}
        onConfirm={confirmCancelPatient}
        busy={isCancellingPatient}
      >
        <p>This will permanently mark the patient as cancelled. This cannot be undone.</p>
        {(cancelPatientName || cancelPatientId) && (
          <p className="text-xs text-gray-500">Patient: <span className="font-mono">{cancelPatientName || cancelPatientId}</span></p>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={showUncallModal}
        title="Uncall Patient?"
        confirmLabel="Yes, Uncall"
        confirmTone="orange"
        onCancel={()=>{ if (isUncallingPatient) return; setShowUncallModal(false); setUncallPatientId(null); }}
        onConfirm={confirmUncallPatient}
        busy={isUncallingPatient}
      >
        <p>Moves the patient back to Waiting and frees the active slot. Auto-advance is unaffected.</p>
        {(uncallPatientName || uncallPatientId) && (
          <p className="text-xs text-gray-500">Patient: <span className="font-mono">{uncallPatientName || uncallPatientId}</span></p>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={showCompleteModal}
        title="Complete Patient?"
        confirmLabel="Yes, Complete"
        confirmTone="green"
        onCancel={()=>{ if (isCompletingPatient) return; setShowCompleteModal(false); setCompletePatientId(null); setCompletePatientName(null); }}
        onConfirm={confirmCompletePatient}
        busy={isCompletingPatient}
      >
        <p>Marks this patient as completed. This increments metrics and (if auto-advance) may call the next patient automatically.</p>
        {(completePatientName || completePatientId) && (
          <p className="text-xs text-gray-500">Patient: <span className="font-mono">{completePatientName || completePatientId}</span></p>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={showAdvanceModal}
        title="Advance Queue?"
        confirmLabel="Advance"
        confirmTone="blue"
        allowSkipToday
        defaultSkipToday={false}
        onCancel={()=>{ if (isNextPatientLoading) return; setShowAdvanceModal(false); }}
        onConfirm={async (skip)=>{ await handleNextPatient(); if (skip) { try { localStorage.setItem(`wf_skip_adv_${new Date().toISOString().split('T')[0]}`, '1'); setSkipAdvanceToday(true);} catch(e){ console.warn('Persist skip adv failed', e);} } setShowAdvanceModal(false); }}
        busy={isNextPatientLoading}
      >
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
                <p className="text-gray-500">Current: {current ? <span className="font-mono">{current.name} (#{current.tokenNumber})</span> : '—'}</p>
                <p className="text-gray-500">Next: {next ? <span className="font-mono">{next.name} (#{next.tokenNumber})</span> : '—'}</p>
              </div>
            </div>
          );
        })()}
      </ConfirmModal>

      <ConfirmModal
        open={showPauseModal}
        title="Pause Queue?"
        confirmLabel="Yes, Pause"
        confirmTone="yellow"
        allowSkipToday
        onCancel={()=>{ if (isPauseQueueLoading) return; setShowPauseModal(false); }}
        onConfirm={async (skip)=>{ await handleTogglePauseQueue(); if (skip) { try { localStorage.setItem(`wf_skip_pause_${new Date().toISOString().split('T')[0]}`, '1'); setSkipPauseToday(true);} catch(e){ console.warn('Persist skip pause failed', e);} } setShowPauseModal(false); }}
        busy={isPauseQueueLoading}
      >
        <p>Pausing prevents calling or advancing patients until you resume. Current in-progress patient (if any) is unaffected.</p>
      </ConfirmModal>

      {activeActionMessage && (
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-600" role="status">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" aria-hidden />
          <span>{activeActionMessage}</span>
        </div>
      )}

      {(message || error) && (
        <div className="mb-4 text-sm" role="status">
          {message && <div className="text-green-600">{message}</div>}
          {error && <div className="text-red-600" role="alert">{error}</div>}
        </div>
      )}
      {isReadOnly && (
        <div className="mb-4 text-xs rounded-md border border-gray-300 bg-gray-100/70 px-3 py-2 text-gray-600">
          Viewing historical queue data for <span className="font-mono">{queueId}</span>. Actions are disabled.
        </div>
      )}

      {/* Patient List Grouped */}
      {(() => {
        if (loadingPatients) {
          return (
            <div className="space-y-2" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    <div className="wf-skeleton w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <div className="wf-skeleton h-4 w-1/3 rounded" />
                      <div className="wf-skeleton h-3 w-1/4 rounded mt-2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        if (patients.length === 0) {
          return <div className="text-gray-600 text-center py-8">No patients in queue</div>;
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
            <div key={groupKey} className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div className="flex items-center">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">{titles[groupKey]}</h4>
                  <span className="ml-2 text-xs text-gray-500">{list.length}</span>
                </div>
                
                {/* Add controls for waiting section */}
                {groupKey === 'waiting' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={()=>{ if (skipAdvanceToday) { handleNextPatient(); } else { setShowAdvanceModal(true); } }}
                      disabled={isNextPatientLoading || !patients.length || endedFlag || autoAdvance}
                      className="h-7 px-3 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed border-0 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                      title={autoAdvance ? "Next Patient is automatic when auto-advance is enabled" : "Call the next waiting patient"}
                    >
                      {isNextPatientLoading ? 'Processing…' : 'Next Patient'}
                    </button>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-2 py-1 transition-all duration-200 shadow-sm hover:shadow cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoAdvance}
                        disabled={isAutoAdvUpdating}
                        onChange={(e) => handleToggleAutoAdvance(e.target.checked)}
                        className="h-3 w-3 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span className="whitespace-nowrap">Auto-advance</span> {isAutoAdvUpdating && <span className="text-[10px] text-gray-400">(saving)</span>}
                    </label>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {list.map(patient => {
                  const isInProgress = patient.status === 'in-progress';
                  const isCompleted = patient.status === 'completed';
                  const isCancelled = patient.status === 'cancelled';
                  const canCall = !isCompleted && !isCancelled && patient.status === 'waiting' && queueStatus !== 'paused' && queueStatus !== 'ended';
                  const canComplete = isInProgress && !isCompleted;
                  const canCancel = !isCompleted && !isCancelled;
                  const canUncall = isInProgress && !isCompleted && !isCancelled;
                  return (
                    <div
                      key={patient.id}
                      className="queue-row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 hover:shadow-md transition-all duration-200 active:scale-[.995]"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="queue-token bg-indigo-50 text-indigo-700 border border-indigo-200 w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0">
                          {patient.tokenNumber}
                        </div>
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <p className={`font-medium truncate ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{patient.name}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                            {patient.age !== undefined && <span className="inline-flex items-center gap-1"><span className="text-gray-400">Age:</span>{patient.age}</span>}
                            {patient.phone && <span className="inline-flex items-center gap-1 truncate"><span className="text-gray-400">Phone:</span>{patient.phone}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClasses(patient.status)}`}>{getStatusText(patient.status)}</span>
                          {isInProgress && <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-indigo-100">Now</span>}
                        </div>
                      </div>
                      <div className="queue-actions flex flex-wrap gap-2 text-xs sm:text-sm flex-shrink-0">
                        {canCall && <Button onClick={() => handleCallPatient(patient.id)} variant="accent" size="sm" className="px-3 py-1.5 h-auto">Call</Button>}
                        {canComplete && <Button onClick={() => requestCompletePatient(patient.id)} variant="secondary" size="sm" className="px-3 py-1.5 h-auto">Done</Button>}
                        {canUncall && <Button onClick={() => requestUncallPatient(patient.id)} variant="outline" size="sm" className="px-3 py-1.5 h-auto">Uncall</Button>}
                        {canCancel && <Button onClick={() => requestCancelPatient(patient.id)} variant="danger" size="sm" className="px-3 py-1.5 h-auto">Cancel</Button>}
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
