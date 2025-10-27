"use client";

import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { auth, db, functions } from '../lib/firebase';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

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
      const bootstrap = httpsCallable(functions, 'bootstrapClinicAccount');
      const response = await bootstrap({
        clinicName: 'Demo Clinic',
        doctorName: 'Demo Doctor',
        specialty: 'General'
      });
      const result = response.data as { success?: boolean; clinicId?: string; doctorId?: string };
      if (!result?.success) {
        throw new Error('Demo bootstrap failed');
      }
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: demoEmail,
        clinicId: result.clinicId,
        doctorId: result.doctorId,
        createdAt: new Date().toISOString()
      }, { merge: true });
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
          <div className="text-sm text-muted-foreground">Signed in as <strong className="text-foreground">{user.email}</strong></div>
          <div className="flex items-center gap-3">
            <Button onClick={doSignOut} size="sm" variant="destructive" className="px-3 h-8">Sign out</Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-muted-foreground">Sign in / Sign up</div>
            <div className="text-xs text-muted-foreground">Mode: <strong>{mode}</strong></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="col-span-2" />
            <Input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" />
          </div>
          {mode === 'signup' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <Input value={clinicId} onChange={e=>setClinicId(e.target.value)} placeholder="Clinic ID (optional)" className="col-span-2" />
              <Input value={doctorId} onChange={e=>setDoctorId(e.target.value)} placeholder="Doctor ID (optional)" />
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
            <div className="text-xs text-muted-foreground mt-2">Creates a demo clinic/doctor and signs you in (dev only).</div>
          </div>
          {error && <div className="mt-2 text-sem-danger text-sm">{error}</div>}
          {success && <div className="mt-2 text-sem-success text-sm">{success}</div>}
          <div className="mt-2 text-xs text-muted-foreground">Simplified mode: any authenticated user can manage queues.</div>
        </div>
      )}
    </div>
  );
}
