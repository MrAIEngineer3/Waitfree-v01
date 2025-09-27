"use client";
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';

interface Mapping { clinicId?: string; doctorId?: string; clinicName?: string; doctorName?: string; specialty?: string; }

export default function AccountBadge() {
  const [email, setEmail] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setEmail(u?.email ?? null);
      if (!u) {
        setMapping(null);
        return;
      }
      const ref = doc(db, 'users', u.uid);
      const off = onSnapshot(ref, snap => {
        setMapping(snap.exists() ? (snap.data() as Mapping) : null);
      });
      return () => off();
    });
    return () => unsub();
  }, []);

  if (!email) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <a href="/auth/login" className="px-3 py-1.5 rounded bg-blue-600 text-white font-medium">Sign In</a>
        <a href="/auth/signup" className="px-3 py-1.5 rounded bg-green-600 text-white font-medium">Create Clinic</a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs bg-white/70 border border-gray-200 rounded-full pl-3 pr-2 py-1 shadow-sm">
      <div className="flex flex-col leading-tight">
        <span className="font-semibold text-gray-800">{mapping?.doctorName || email}</span>
        <span className="text-[10px] text-gray-500">{mapping?.clinicName || 'Clinic pending'}{mapping?.specialty ? ` • ${mapping.specialty}` : ''}</span>
      </div>
      <button onClick={()=>signOut(auth)} className="text-gray-500 hover:text-gray-800 text-[11px] font-medium px-2 py-0.5 rounded hover:bg-gray-100">Sign out</button>
    </div>
  );
}
