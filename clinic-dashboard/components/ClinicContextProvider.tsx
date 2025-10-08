"use client";
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import ClinicContext from './ClinicContext';

interface Doctor {
  id: string; 
  name: string; 
  specialty: string; 
  clinicId: string; 
  email?: string; 
  phone?: string; 
  createdAt?: any;
}

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

interface ClinicContextProviderProps {
  children: React.ReactNode;
}

export default function ClinicContextProvider({ children }: ClinicContextProviderProps) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const todayKey = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let unsubscribeDoctor: (() => void) | null = null;
    let unsubscribeQueue: (() => void) | null = null;
    let unsubscribeClinic: (() => void) | null = null;
    let unsubscribeUserDoc: (() => void) | null = null;

    const attachQueueListener = (cId: string, dId: string, dayKey: string) => {
      try { if (unsubscribeQueue) unsubscribeQueue(); } catch {}
      const queueRef = doc(db, 'clinics', cId, 'doctors', dId, 'queues', dayKey);
      unsubscribeQueue = onSnapshot(queueRef, (snap) => {
        if (snap.exists()) setQueue({ id: snap.id, ...snap.data() } as any); 
        else setQueue(null);
      });
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      for (const fn of [unsubscribeDoctor, unsubscribeQueue, unsubscribeClinic, unsubscribeUserDoc]) { 
        try { fn && fn(); } catch {} 
      }
      unsubscribeDoctor = unsubscribeQueue = unsubscribeClinic = unsubscribeUserDoc = null;
      
      if (!user) { 
        setClinicId(null); 
        setDoctorId(null); 
        setDoctor(null); 
        setQueue(null); 
        setClinicName(null); 
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
        
        if (!cId || !dId) { 
          setDoctor(null); 
          setQueue(null); 
          setClinicName(null); 
          return; 
        }
        
        try { 
          if (unsubscribeClinic) unsubscribeClinic(); 
        } catch {}
        
        const clinicRef = doc(db, 'clinics', cId);
        unsubscribeClinic = onSnapshot(clinicRef, snap => { 
          if (snap.exists()) { 
            const d = snap.data() as { name?: string }; 
            setClinicName(d?.name ?? null); 
          } else {
            setClinicName(null); 
          }
        });
        
        try { 
          if (unsubscribeDoctor) unsubscribeDoctor(); 
        } catch {}
        
        const doctorRef = doc(db, 'clinics', cId, 'doctors', dId);
        unsubscribeDoctor = onSnapshot(doctorRef, s => { 
          if (s.exists()) setDoctor({ id: s.id, ...s.data() } as any); 
          else setDoctor(null); 
        });
        
        attachQueueListener(cId, dId, todayKey);
      });
    });

    return () => { 
      try { unsubAuth(); } catch {} 
      for (const fn of [unsubscribeDoctor, unsubscribeQueue, unsubscribeClinic, unsubscribeUserDoc]) { 
        try { fn && fn(); } catch {} 
      } 
    };
  }, [todayKey]);

  const contextValue = {
    clinicId,
    clinicName,
    doctorName: doctor?.name || null,
    doctorSpecialty: doctor?.specialty || null,
    queueStatus: queue?.status,
  };

  return (
    <ClinicContext.Provider value={contextValue}>
      {children}
    </ClinicContext.Provider>
  );
}
