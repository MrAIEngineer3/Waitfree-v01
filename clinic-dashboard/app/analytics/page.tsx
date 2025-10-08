"use client";
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import StatsCards from '../../components/StatsCards';
import { auth, db } from '../../lib/firebase';

export default function AnalyticsPage() {
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [clinicName, setClinicName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let unsubscribeClinic: (() => void) | null = null;
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      for (const fn of [unsubscribeClinic, unsubscribeUserDoc]) { 
        try { fn && fn(); } catch {} 
      }
      unsubscribeClinic = unsubscribeUserDoc = null;
      
      if (!user) { 
        setClinicId(null); 
        setDoctorId(null); 
        setClinicName(null); 
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
      });
    });

    return () => { 
      try { unsubAuth(); } catch {} 
      for (const fn of [unsubscribeClinic, unsubscribeUserDoc]) { 
        try { fn && fn(); } catch {} 
      } 
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Analytics</h1>
        <p className="mt-2 text-sm text-gray-600">
          Insights and statistics for {clinicName || 'your clinic'}
        </p>
      </div>

      {clinicId && doctorId ? (
        <div className="space-y-8">
          <div className="rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Clinic Statistics</h2>
            <StatsCards clinicId={clinicId} doctorId={doctorId} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Performance Metrics</h2>
            <div className="text-sm text-gray-600">
              <p>Advanced analytics features coming soon...</p>
              <ul className="mt-3 list-disc list-inside space-y-1 text-xs">
                <li>Average wait times by day/week</li>
                <li>Patient flow patterns</li>
                <li>Queue efficiency metrics</li>
                <li>Doctor utilization rates</li>
              </ul>
            </div>
          </div>
        </div>
      ) : authReady && (
        <div className="rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm p-6 shadow-sm">
          <div className="text-center py-8">
            <p className="text-gray-600">
              {(!clinicId || !doctorId) 
                ? 'Complete your clinic setup to view analytics'
                : 'Loading analytics...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
