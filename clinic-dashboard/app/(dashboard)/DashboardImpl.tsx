"use client";
// Extracted original dashboard implementation for status badge replacement
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import DateNavigator from '../../components/DateNavigator';
import QueueList from '../../components/QueueList';
import QueueMetrics from '../../components/QueueMetrics';
import StatsCards from '../../components/StatsCards';
import Badge from '../../components/ui/Badge';
import { auth, db } from '../../lib/firebase';

interface Doctor {
  id: string; name: string; specialty: string; clinicId: string; email?: string; phone?: string; createdAt?: any;
}
interface Queue { id: string; doctorId: string; clinicId: string; status: 'active' | 'paused' | 'ended'; currentToken: number; totalPatients: number; completedPatients: number; createdAt?: any; updatedAt?: any; }

export default function DashboardImpl(){
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const todayKey = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  useEffect(()=>{
    if (typeof window === 'undefined') return;
    let unsubscribeDoctor: (()=>void)|null=null;
    let unsubscribeQueue: (()=>void)|null=null;
    let unsubscribeClinic: (()=>void)|null=null;
    let unsubscribeUserDoc: (()=>void)|null=null;

    const attachQueueListener = (cId:string,dId:string,dayKey:string)=>{
      try{ if(unsubscribeQueue) unsubscribeQueue(); }catch{}
      const queueRef = doc(db,'clinics',cId,'doctors',dId,'queues',dayKey);
      unsubscribeQueue = onSnapshot(queueRef,(snap)=>{
        if(snap.exists()) setQueue({ id: snap.id, ...snap.data() } as any); else setQueue(null);
      });
    };

    const unsubAuth = onAuthStateChanged(auth, (user)=>{
      for (const fn of [unsubscribeDoctor,unsubscribeQueue,unsubscribeClinic,unsubscribeUserDoc]){ try{ fn && fn(); }catch{} }
      unsubscribeDoctor=unsubscribeQueue=unsubscribeClinic=unsubscribeUserDoc=null;
      if(!user){ setClinicId(null); setDoctorId(null); setDoctor(null); setQueue(null); setClinicName(null); setAuthReady(true); return; }
      const userRef = doc(db,'users',user.uid);
      unsubscribeUserDoc = onSnapshot(userRef,(snap)=>{
        let cId:string|null=null; let dId:string|null=null;
        if (snap.exists()){
          const data = snap.data() as { clinicId?:string; doctorId?:string };
          if (data?.clinicId) cId=data.clinicId; if (data?.doctorId) dId=data.doctorId;
        }
        setClinicId(cId); setDoctorId(dId); setAuthReady(true);
        if(!cId || !dId){ setDoctor(null); setQueue(null); setClinicName(null); return; }
        try{ if(unsubscribeClinic) unsubscribeClinic(); }catch{}
        const clinicRef = doc(db,'clinics',cId);
        unsubscribeClinic = onSnapshot(clinicRef, snap=>{ if(snap.exists()){ const d = snap.data() as { name?:string }; setClinicName(d?.name??null); } else setClinicName(null); });
        try{ if(unsubscribeDoctor) unsubscribeDoctor(); }catch{}
        const doctorRef = doc(db,'clinics',cId,'doctors',dId);
        unsubscribeDoctor = onSnapshot(doctorRef, s=>{ if(s.exists()) setDoctor({ id: s.id, ...s.data() } as any); else setDoctor(null); });
        attachQueueListener(cId,dId,selectedDate);
      });
    });

    return ()=>{ try{unsubAuth();}catch{} for (const fn of [unsubscribeDoctor,unsubscribeQueue,unsubscribeClinic,unsubscribeUserDoc]){ try{ fn && fn(); }catch{} } };
  },[selectedDate]);

  const renderQueueStatus = (status: Queue['status']|undefined)=>{
    if(!status) return null;
    const tone = status==='active' ? 'success' : status==='paused' ? 'warning' : 'danger';
    const text = status==='active' ? 'Active' : status==='paused' ? 'Paused' : 'Ended';
    return <Badge tone={tone} variant="solid" size="sm" className="ml-2">{text}</Badge>;
  };

  return (
    <div className="space-y-8">
      {(doctor || clinicName) && (
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100 p-4 sm:p-5 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none select-none opacity-[0.07] bg-[radial-gradient(circle_at_20%_20%,#2563eb,transparent_60%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 min-w-0">
                {clinicName && (
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700 min-w-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0"><path d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" /></svg>
                    <span className="text-base sm:text-lg tracking-tight truncate">{clinicName}</span>
                  </div>
                )}
                {doctor && (
                  <div className="flex items-center gap-2 min-w-0">
                    {(clinicName) && <span className="hidden sm:inline text-gray-400">•</span>}
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2 min-w-0">
                      <span className="truncate">{doctor.name}</span>
                      {renderQueueStatus(queue?.status)}
                    </h1>
                    {doctor.specialty && (
                      <>
                        <span className="hidden sm:inline text-gray-400">•</span>
                        <span className="text-sm text-gray-600 truncate">{doctor.specialty}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {queue && (
              <div className="flex-shrink-0"><QueueMetrics currentToken={queue.currentToken} completedPatients={queue.completedPatients} totalPatients={queue.totalPatients} status={queue.status} /></div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-8">
          <div className="rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium text-gray-800">Queue Management</h2>
              <DateNavigator value={selectedDate} onChange={setSelectedDate} max={todayKey} disableFuture showTodayButton />
            </div>
            {clinicId && doctorId && (
              <QueueList clinicId={clinicId} doctorId={doctorId} queueStatus={queue?.status} dayKey={selectedDate} />
            )}
            {(!clinicId || !doctorId) && authReady && (
              <div className="p-4 text-sm text-gray-600">
                {(!clinicId || !doctorId) ? 'Waiting for account to attach a clinic/doctor mapping. Create a demo account or add clinicId/doctorId to your user doc.' : 'Loading...'}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-8">
          <div className="rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Clinic Statistics</h2>
            <StatsCards clinicId={clinicId ?? undefined} doctorId={doctorId ?? undefined} />
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Doctor Management</h3>
              <p className="text-gray-600 text-xs leading-relaxed">Scheduling and management tools will appear here as the platform evolves.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
