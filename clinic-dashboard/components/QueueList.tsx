'use client';

import { collection, collectionGroup, doc, getDoc, getDocs, onSnapshot, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { db, functions } from '../lib/firebase';
import ConfirmModal from './ConfirmModal';

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
  queueStatus?: 'active' | 'paused' | 'ended';
}

export default function QueueList({ clinicId: clinicIdProp, doctorId: doctorIdProp, queueStatus }: QueueListProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isNextPatientLoading, setIsNextPatientLoading] = useState(false);
  const [isPauseQueueLoading, setIsPauseQueueLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true); // will sync with queue doc's autoAdvance
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
  const today = new Date().toISOString().split('T')[0];
  const queueId = today;

  useEffect(() => {
    console.log('[QueueList] useEffect triggered.');

    // Only run on client side
    if (typeof window === 'undefined') {
      console.log('[QueueList] Not on client, returning.');
      return;
    }

    // If mapping is missing, don't attempt to subscribe
    if (!clinicId || !doctorId) {
      console.log('[QueueList] Missing clinicId or doctorId. Clearing patients and returning.', { clinicId, doctorId });
      setPatients([]);
      return;
    }

    console.log('[QueueList] Props are valid, proceeding to query.', { clinicId, doctorId, queueId });

    // Deep instrumentation: log firebase app options & env flags to detect mismatch
    try {
      // Safely attempt to read internal app options without using explicit any
      const appOptionsContainer = (db as unknown as { _app?: { options?: Record<string, unknown> }; app?: { options?: Record<string, unknown> } });
      const appOptions = appOptionsContainer._app?.options || appOptionsContainer.app?.options || {};
      const projId = (appOptions as { projectId?: string }).projectId;
      const apiKey = (appOptions as { apiKey?: string }).apiKey;
      console.log('[QueueList][DIAG] App Options projectId:', projId, 'apiKey:', apiKey);
      console.log('[QueueList][DIAG] Env flags:', {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_USE_FIREBASE_EMULATOR: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        NEXT_PUBLIC_FUNCTIONS_BASE_URL: process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL
      });
    } catch (e) {
      console.warn('[QueueList][DIAG] Failed to log app options', e);
    }

    // Create reference to the patients sub-collection
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
  console.log('[QueueList] Querying Firestore path:', patientsRef.path);


    // Create query without ordering to test Firestore response
    const patientsQuery = query(patientsRef);

    // One-time fetch (getDocs) BEFORE attaching snapshot to compare behavior
    (async () => {
      try {
        console.log('[QueueList][DIAG] Performing one-time getDocs on patients collection...');
        const snap = await getDocs(patientsRef);
        console.log('[QueueList][DIAG] getDocs result size:', snap.size);
        snap.forEach(d => console.log('[QueueList][DIAG] getDocs doc:', d.id, d.data()));
        if (snap.size === 0) {
          console.log('[QueueList][DIAG] getDocs empty. Will attempt collectionGroup fallback search by queueId & clinicId to verify visibility.');
          try {
            const cg = await getDocs(query(collectionGroup(db, 'patients')));
            console.log('[QueueList][DIAG] collectionGroup(patients) size:', cg.size);
            type PatientDocShape = { queueId?: string; clinicId?: string; doctorId?: string; [k: string]: unknown };
            cg.forEach(d => {
              const data = d.data() as PatientDocShape;
              if (data.queueId === queueId && data.clinicId === clinicId && data.doctorId === doctorId) {
                console.log('[QueueList][DIAG] Found matching patient via collectionGroup but not via direct subcollection path:', d.id, data);
              }
            });
          } catch (cgErr) {
            console.warn('[QueueList][DIAG] collectionGroup fallback failed:', cgErr);
          }
        }
      } catch (gdErr) {
        console.error('[QueueList][DIAG] getDocs failed:', gdErr);
      }
    })();

    // Probe one queue doc & doctor doc existence to ensure upstream mapping path valid
    (async () => {
      try {
        const queueDocRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId);
        const queueSnap = await getDoc(queueDocRef);
        console.log('[QueueList][DIAG] Queue doc exists?', queueSnap.exists(), queueSnap.exists() ? queueSnap.data() : null);
        if (queueSnap.exists()) {
          const qData = queueSnap.data() as { autoAdvance?: unknown };
          if (typeof qData.autoAdvance === 'boolean') {
            setAutoAdvance(qData.autoAdvance);
          }
        }
        const doctorDocRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);
        const doctorSnap = await getDoc(doctorDocRef);
        console.log('[QueueList][DIAG] Doctor doc exists?', doctorSnap.exists());
      } catch (probeErr) {
        console.warn('[QueueList][DIAG] Queue/Doctor probe failed:', probeErr);
      }
    })();

    // Listen to queue doc for autoAdvance flag changes (and future metadata like status)
    const queueDocRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId);
    const unsubQueue = onSnapshot(queueDocRef, snap => {
      if (snap.exists()) {
        const data = snap.data() as { autoAdvance?: unknown };
        if (typeof data.autoAdvance === 'boolean') {
          setAutoAdvance(data.autoAdvance);
        }
      }
    }, err => console.warn('[QueueList] queueDoc onSnapshot error', err));

    // Set up real-time listener
    console.log('[QueueList] Attaching onSnapshot listener...');
    const unsubscribe = onSnapshot(patientsQuery, (snapshot) => {
      console.log('[QueueList] onSnapshot listener FIRED.');
      console.log(`[QueueList] Snapshot details: empty=${snapshot.empty}, size=${snapshot.size}`);

      const patientsList: Patient[] = [];
      snapshot.forEach((doc) => {
        console.log(`[QueueList] Found patient doc: ${doc.id}`, doc.data());
        patientsList.push({
          id: doc.id,
          ...doc.data()
        } as Patient);
      });

      console.log('[QueueList] Setting patients state with:', patientsList);
      setPatients(patientsList);

    }, (error) => {
      console.error('[QueueList] onSnapshot listener ERRORED:', error);
    });

    // Cleanup function
    return () => {
      console.log('[QueueList] useEffect cleanup. Unsubscribing from snapshot listener.');
      unsubscribe();
      unsubQueue();
    };
  }, [clinicId, doctorId, queueId]);

  // Handler for "Next Patient" button
  const handleNextPatient = async () => {
    if (queueStatus === 'paused') {
      setError('Queue is paused. Resume it before advancing.');
      return;
    }
    setIsNextPatientLoading(true);
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
    }
  };

  // Handler for "Pause Queue" button
  const handleTogglePauseQueue = async () => {
    setIsPauseQueueLoading(true);
    try {
      console.log('Toggling queue pause status');

      // Get callable reference to updateQueueStatus function
      const updateQueueStatus = httpsCallable(functions, 'updateQueueStatus');

      const target = queueStatus === 'paused' ? 'active' : 'paused';
      const result = await updateQueueStatus({
        clinicId,
        doctorId,
        queueId,
        newStatus: target
      });

      console.log('Queue status updated successfully:', result.data);
      setMessage(`Queue ${target === 'paused' ? 'paused' : 'resumed'}.`);
      setError(null);
    } catch (error) {
      console.error('Error updating queue status:', error);
      setError('Failed to update queue status.');
    } finally {
      setIsPauseQueueLoading(false);
    }
  };

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
    }
  };

  // Toggle autoAdvance on server
  const handleToggleAutoAdvance = async (checked: boolean) => {
    setIsAutoAdvUpdating(true);
    try {
      const setQueueAutoAdvance = httpsCallable(functions, 'setQueueAutoAdvance');
      await setQueueAutoAdvance({ clinicId, doctorId, queueId, enabled: checked });
      // optimistic update; real value will flow from queue doc listener too
      setAutoAdvance(checked);
    } catch (e) {
      console.error('Failed to set autoAdvance', e);
      setError('Failed to update auto-advance flag.');
    } finally {
      setIsAutoAdvUpdating(false);
    }
  };

  const handleCallPatient = async (patientId: string) => {
    if (!patientId) return;
    if (queueStatus === 'paused') { setError('Queue is paused. Resume first.'); return; }
    try {
      setError(null); setMessage(null);
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus');
      await updatePatientStatus({ clinicId, doctorId, queueId, patientId, newStatus: 'in-progress' });
      setMessage('Patient called.');
    } catch (e) {
      console.error('Call patient failed', e);
      setError('Failed to call patient.');
    }
  };

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

  return (
    <div className="space-y-4 max-w-5xl mx-auto px-3 md:px-4 pb-32 md:pb-8">
      {/* Desktop / tablet toolbar */}
      <div className="hidden sm:flex gap-3 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-gray-700 bg-gray-100/60 px-3 py-2 rounded-lg border border-gray-300">
          <input
            type="checkbox"
            checked={autoAdvance}
            disabled={isAutoAdvUpdating}
            onChange={(e) => handleToggleAutoAdvance(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          Auto-advance next patient {isAutoAdvUpdating && <span className="text-[10px] text-gray-500">(saving)</span>}
        </label>
        <button
          onClick={()=>{ if (skipAdvanceToday) { handleNextPatient(); } else { setShowAdvanceModal(true); } }}
          disabled={isNextPatientLoading || !patients.length || endedFlag}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {isNextPatientLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </>
          ) : (
            'Next Patient'
          )}
        </button>
        <button
          onClick={()=>{ if (pausedFlag) { handleTogglePauseQueue(); } else { if (skipPauseToday) { handleTogglePauseQueue(); } else { setShowPauseModal(true); } } }}
          disabled={isPauseQueueLoading || endedFlag}
          className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {isPauseQueueLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Updating...
            </>
          ) : (
            pausedFlag ? 'Resume Queue' : 'Pause Queue'
          )}
        </button>
        {!endedFlag && (
          <button
            onClick={() => {
              setShowEndModal(true);
             }}
            disabled={endedFlag}
            className="bg-red-700 hover:bg-red-800 disabled:bg-red-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >End Queue</button>
        )}
        {endedFlag && (
          <button
            onClick={() => {
              const updateQueueStatus = httpsCallable(functions, 'updateQueueStatus');
              updateQueueStatus({ clinicId, doctorId, queueId, newStatus: 'active' })
                .then(() => { setMessage('Queue restarted and set to Active.'); setError(null); })
                .catch(e => { console.error('Restart queue failed', e); setError('Failed to restart queue.'); });
            }}
            className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >Restart Queue</button>
        )}
      </div>
      {/* Mobile sticky action bar */}
  <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 px-3 py-3 flex items-center gap-2 overflow-x-auto" role="toolbar" aria-label="Queue actions" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 0.75rem)' }}>
        <button
          onClick={()=>{ if (skipAdvanceToday) { handleNextPatient(); } else { setShowAdvanceModal(true); } }}
          disabled={isNextPatientLoading || !patients.length || endedFlag}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white px-3 py-3 rounded-lg font-medium text-xs tracking-wide"
        >{isNextPatientLoading ? 'Working...' : 'Next'}</button>
        <button
          onClick={()=>{ if (pausedFlag) { handleTogglePauseQueue(); } else { if (skipPauseToday) { handleTogglePauseQueue(); } else { setShowPauseModal(true); } } }}
          disabled={isPauseQueueLoading || endedFlag}
          className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 disabled:cursor-not-allowed text-white px-3 py-3 rounded-lg font-medium text-[11px] tracking-wide"
        >{isPauseQueueLoading ? 'Updating' : (pausedFlag ? 'Resume' : 'Pause')}</button>
        {!endedFlag && (
          <button
            onClick={()=>setShowEndModal(true)}
            className="flex-1 bg-red-700 hover:bg-red-800 text-white px-3 py-3 rounded-lg font-medium text-[11px] tracking-wide"
          >End</button>
        )}
        {endedFlag && (
          <button
            onClick={() => {
              const updateQueueStatus = httpsCallable(functions, 'updateQueueStatus');
              updateQueueStatus({ clinicId, doctorId, queueId, newStatus: 'active' })
                .then(() => { setMessage('Queue restarted.'); setError(null); })
                .catch(e => { console.error('Restart queue failed', e); setError('Failed to restart queue.'); });
            }}
            className="flex-1 bg-green-700 hover:bg-green-800 text-white px-3 py-3 rounded-lg font-medium text-[11px] tracking-wide"
          >Restart</button>
        )}
        <label className="flex items-center gap-1 text-[10px] text-gray-700 bg-gray-100/70 px-2.5 py-2 rounded-lg border border-gray-300 whitespace-nowrap">
          <input
            type="checkbox"
            checked={autoAdvance}
            disabled={isAutoAdvUpdating}
            onChange={(e) => handleToggleAutoAdvance(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          Auto
        </label>
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
          const updateQueueStatus = httpsCallable(functions, 'updateQueueStatus');
          updateQueueStatus({ clinicId, doctorId, queueId, newStatus: 'ended' })
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

      {(message || error) && (
        <div className="mb-4 text-sm">
          {message && <div className="text-green-600">{message}</div>}
          {error && <div className="text-red-600">{error}</div>}
        </div>
      )}

      {/* Queue Title */}
  <h3 className="text-xl font-semibold text-gray-800 mb-4 sticky top-0 bg-white/90 backdrop-blur z-10 py-2 px-1 -mx-1 sm:static sm:bg-transparent sm:p-0">Current Queue</h3>

      {/* Patient List Grouped */}
      {(() => {
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
              <div className="flex items-center mb-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">{titles[groupKey]}</h4>
                <span className="ml-2 text-xs text-gray-500">{list.length}</span>
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
                    <div key={patient.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-100 rounded-lg p-4 hover:bg-gray-200 transition-colors shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className="bg-gray-200 text-gray-800 w-10 h-10 rounded-full flex items-center justify-center font-bold">
                          {patient.tokenNumber}
                        </div>
                        <div className="space-y-1">
                          <p className={`font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{patient.name}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                            {patient.age !== undefined && <span className="inline-flex items-center gap-1"><span className="text-gray-400">Age:</span>{patient.age}</span>}
                            {patient.phone && <span className="inline-flex items-center gap-1"><span className="text-gray-400">Phone:</span>{patient.phone}</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClasses(patient.status)}`}>{getStatusText(patient.status)}</span>
                            {isInProgress && <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-indigo-100">Now</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs md:text-sm">
                        {canCall && <button onClick={() => handleCallPatient(patient.id)} className="bg-blue-600 hover:bg-blue-700 active:scale-[.97] text-white px-3 py-1.5 rounded disabled:bg-blue-400 disabled:cursor-not-allowed">Call</button>}
                        {canComplete && <button onClick={() => requestCompletePatient(patient.id)} className="bg-green-600 hover:bg-green-700 active:scale-[.97] text-white px-3 py-1.5 rounded disabled:bg-green-400 disabled:cursor-not-allowed">Done</button>}
                        {canUncall && <button onClick={() => requestUncallPatient(patient.id)} className="bg-orange-600 hover:bg-orange-700 active:scale-[.97] text-white px-3 py-1.5 rounded disabled:bg-orange-400 disabled:cursor-not-allowed">Uncall</button>}
                        {canCancel && <button onClick={() => requestCancelPatient(patient.id)} className="bg-red-600 hover:bg-red-700 active:scale-[.97] text-white px-3 py-1.5 rounded disabled:bg-red-400 disabled:cursor-not-allowed">Cancel</button>}
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
