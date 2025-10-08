"use client";
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useClinicContext } from '../components/ClinicContext';
import DateNavigator from '../components/DateNavigator';
import QueueList from '../components/QueueList';
import { auth, db } from '../lib/firebase';
// QR is now handled in AppShell header. No import needed here.

interface Queue { 
  id: string; 
  doctorId: string; 
  clinicId: string; 
  status: 'active' | 'paused' | 'ended'; 
  currentToken: number; 
  totalPatients: number; 
  completedPatients: number; 
  createdAt?: any; 
  updatedAt?: any; 
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
}

export default function DashboardImpl() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // Removed Active Doctor section; these are no longer needed
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const todayKey = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  // QR modal moved to AppShell header to avoid duplication
  
  // Get clinic context for display
  const { clinicName, doctorName, doctorSpecialty } = useClinicContext();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let unsubscribeQueue: (() => void) | null = null;
    let unsubscribeUserDoc: (() => void) | null = null;

    const attachQueueListener = (cId: string, dId: string, dayKey: string) => {
      try { if (unsubscribeQueue) unsubscribeQueue(); } catch {}
      const queueRef = doc(db, 'clinics', cId, 'doctors', dId, 'queues', dayKey);
      unsubscribeQueue = onSnapshot(queueRef, (snap) => {
        if (snap.exists()) setQueue({ id: snap.id, ...snap.data() } as any); 
        else setQueue(null);
      });
    };

    // Active doctor selection removed – skip fetching doctors here

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      for (const fn of [unsubscribeQueue, unsubscribeUserDoc]) { 
        try { fn && fn(); } catch {} 
      }
      unsubscribeQueue = unsubscribeUserDoc = null;
      
      if (!user) { 
        setClinicId(null); 
        setDoctorId(null); 
        setQueue(null); 
        setDoctors([]);
        setAuthReady(true); 
        return; 
      }
      
      const userRef = doc(db, 'users', user.uid);
      unsubscribeUserDoc = onSnapshot(userRef, (snap) => {
        let cId: string | null = null; 
        let dId: string | null = null;
        
        if (snap.exists()) {
          const data = snap.data() as { clinicId?: string; doctorId?: string };
          if (data?.clinicId) cId = data.clinicId; 
          if (data?.doctorId) dId = data.doctorId;
        }
        
        setClinicId(cId); 
        setDoctorId(dId); 
        setAuthReady(true);
        
        if (!cId) { 
          setQueue(null); 
          setDoctors([]);
          return; 
        }
        
  // Active doctor selection removed – no doctor list fetch
        
        if (!dId) { 
          setQueue(null); 
          return; 
        }
        
        attachQueueListener(cId, dId, selectedDate);
      });
    });

    return () => { 
      try { unsubAuth(); } catch {} 
      for (const fn of [unsubscribeQueue, unsubscribeUserDoc]) { 
        try { fn && fn(); } catch {} 
      } 
    };
  }, [selectedDate]);

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
                  <h2 className="text-lg md:text-xl font-semibold text-gray-900">Today's Queue</h2>
                  <DateNavigator value={selectedDate} onChange={setSelectedDate} max={todayKey} disableFuture showTodayButton />
                </div>
                
                {/* Modern Queue Control Buttons */}
                {queue && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="h-8 px-3 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                      onClick={() => {
                        // This will be handled by QueueList functionality
                        const event = new CustomEvent('togglePauseQueue');
                        window.dispatchEvent(event);
                      }}
                    >
                      {queue.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    {queue.status !== 'ended' && (
                      <button
                        className="h-8 px-3 text-xs font-medium text-white bg-red-500 hover:bg-red-600 border-0 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                        onClick={() => {
                          // This will be handled by QueueList functionality
                          const event = new CustomEvent('endQueue');
                          window.dispatchEvent(event);
                        }}
                      >
                        End Queue
                      </button>
                    )}
                    {queue.status === 'ended' && (
                      <button
                        className="h-8 px-3 text-xs font-medium text-white bg-green-500 hover:bg-green-600 border-0 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                        onClick={() => {
                          // This will be handled by QueueList functionality  
                          const event = new CustomEvent('restartQueue');
                          window.dispatchEvent(event);
                        }}
                      >
                        Restart
                      </button>
                    )}
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
              <QueueList clinicId={clinicId} doctorId={doctorId} queueStatus={queue?.status} dayKey={selectedDate} />
            )}
            {(!clinicId || !doctorId) && authReady && (
              <div className="p-8 text-center text-gray-600 bg-gray-50 rounded-lg border border-dashed border-gray-300 m-6">
                <p className="mb-2 font-medium text-gray-700">Get started</p>
                <p className="leading-relaxed">Create or attach a clinic and doctor mapping to begin managing today's queue.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* QR modal managed globally in AppShell */}
    </div>
  );
}
