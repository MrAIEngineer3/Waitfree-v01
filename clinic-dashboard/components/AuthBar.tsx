"use client";

import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import type { DocumentReference } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import Button from './ui/Button';

// Helper to ensure demo entities exist
async function ensureDemoClinicStructure() {
  const today = new Date().toISOString().split('T')[0];
  const clinicRef = doc(db, 'clinics', 'demo-clinic');
  const doctorRef = doc(db, 'clinics', 'demo-clinic', 'doctors', 'demo-doctor');
  const queueRef = doc(db, 'clinics', 'demo-clinic', 'doctors', 'demo-doctor', 'queues', today);
  const maybeCreate = async (
  ref: DocumentReference,
    data: Record<string, unknown>,
    label: string
  ) => {
    const snap = await getDoc(ref);
    if (!snap.exists()) { await setDoc(ref, data); console.log('Created', label); }
  };
  await maybeCreate(clinicRef, { name: 'Demo Clinic', createdAt: new Date().toISOString() }, 'clinic');
  await maybeCreate(doctorRef, { name: 'Demo Doctor', specialty: 'General', clinicId: 'demo-clinic', createdAt: new Date().toISOString() }, 'doctor');
  await maybeCreate(queueRef, { status: 'active', currentToken: 0, totalPatients: 0, completedPatients: 0, createdAt: new Date().toISOString() }, 'queue');
}

export default function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  async function doSignUp() {
    setError(null); setSuccess(null); setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;
      const userData: Record<string, unknown> = { email: email.trim(), createdAt: new Date().toISOString() };
      if (clinicId) userData.clinicId = clinicId.trim();
      if (doctorId) userData.doctorId = doctorId.trim();
      await setDoc(doc(db, 'users', uid), userData);
      setSuccess('Account created');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create account');
    } finally { setLoading(false); }
  }

  async function doSignIn() {
    setError(null); setSuccess(null); setLoading(true);
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to sign in'); }
    finally { setLoading(false); }
  }

  async function doSignOut() { await signOut(auth); }

  async function createDemoAccount() {
    setError(null); setSuccess(null); setLoading(true);
    try {
      const demoEmail = `demo+${Date.now()}@example.com`;
      const demoPassword = 'DemoPass!123';
      const cred = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
      await ensureDemoClinicStructure();
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: demoEmail,
        clinicId: 'demo-clinic',
        doctorId: 'demo-doctor',
        createdAt: new Date().toISOString()
      });
      setSuccess(`Created demo user ${demoEmail}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create demo account');
    } finally { setLoading(false); }
  }

  // Load profile mapping to populate optional fields when user already has mapping
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data() as { clinicId?: string; doctorId?: string };
            if (data.clinicId) setClinicId(data.clinicId);
            if (data.doctorId) setDoctorId(data.doctorId);
        }
      } catch { /* ignore */ }
    };
    loadProfile();
  }, [user]);

  return (
    <div className="mb-6">
      {user ? (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">Signed in as <strong className="text-gray-900">{user.email}</strong></div>
          <div className="flex items-center gap-3">
            <Button onClick={doSignOut} size="sm" variant="danger" className="px-3 h-8">Sign out</Button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-700">Sign in / Sign up</div>
            <div className="text-xs text-gray-600">Mode: <strong>{mode}</strong></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="col-span-2 p-2 rounded bg-white border border-gray-300" />
            <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" className="p-2 rounded bg-white border border-gray-300" />
          </div>
          {mode === 'signup' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <input value={clinicId} onChange={e=>setClinicId(e.target.value)} placeholder="Clinic ID (optional)" className="col-span-2 p-2 rounded bg-white border border-gray-300" />
              <input value={doctorId} onChange={e=>setDoctorId(e.target.value)} placeholder="Doctor ID (optional)" className="p-2 rounded bg-white border border-gray-300" />
            </div>
          )}
          <div className="flex items-center gap-3">
            {mode === 'signin' ? (
              <>
                <Button onClick={doSignIn} disabled={loading} variant="secondary">Sign in</Button>
                <Button onClick={()=>setMode('signup')} variant="ghost" className="text-sm underline h-auto px-2">Create account</Button>
              </>
            ) : (
              <>
                <Button onClick={doSignUp} disabled={loading} variant="accent">Create account</Button>
                <Button onClick={()=>setMode('signin')} variant="ghost" className="text-sm underline h-auto px-2">Back to sign in</Button>
              </>
            )}
          </div>
          <div className="mt-3">
            <Button onClick={createDemoAccount} disabled={loading} variant="outline" className="text-sm">Create demo account</Button>
            <div className="text-xs text-gray-600 mt-2">Creates a demo clinic/doctor and signs you in (dev only).</div>
          </div>
          {error && <div className="mt-2 text-sem-danger text-sm">{error}</div>}
          {success && <div className="mt-2 text-green-600 text-sm">{success}</div>}
          <div className="mt-2 text-xs text-gray-600">Simplified mode: any authenticated user can manage queues.</div>
        </div>
      )}
    </div>
  );
}
