"use client";

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { auth, functions } from '../../../lib/firebase';

interface BootstrapResult { success: boolean; clinicId: string; doctorId: string; queueId: string; }

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCreating, setDemoCreating] = useState(false);

  const canContinueStep1 = clinicName.trim() && doctorName.trim() && specialty.trim();
  const canSubmit = canContinueStep1 && email.trim() && password.length >= 6;

  const bootstrapFn = httpsCallable(functions, 'bootstrapClinicAccount');

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      // Create the user account
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      console.log('User created:', userCredential.user.uid);
      
      // Store signup data in sessionStorage for the setup page
      sessionStorage.setItem('clinicSignupData', JSON.stringify({
        clinicName: clinicName.trim(),
        doctorName: doctorName.trim(),
        specialty: specialty.trim()
      }));
      
      // Redirect to setup page instead of calling bootstrap directly
      router.push('/auth/setup');
    } catch (err: unknown) {
      console.error('Signup error:', err);
      const message = err instanceof Error ? err.message : 'Failed to sign up';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Dev-only demo quick create
  async function handleCreateDemo() {
    if (!(process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true')) return;
    setError(null);
    setDemoCreating(true);
    try {
      const demoEmail = `demo+${Date.now()}@example.com`;
      const demoPassword = 'DemoPass123!';
      const demoClinic = 'Demo Clinic';
      const demoDoctor = 'Demo Doctor';
      const demoSpecialty = 'General';
      await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
      const res = await bootstrapFn({ clinicName: demoClinic, doctorName: demoDoctor, specialty: demoSpecialty });
      const data = res.data as BootstrapResult;
      if (!data?.success) throw new Error('Demo bootstrap failed');
      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Demo creation failed';
      setError(message);
    } finally {
      setDemoCreating(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-10 px-4 space-y-10">
      <header className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create Your Clinic</h1>
        <p className="text-sm text-gray-600">One signup creates your clinic, doctor profile & today&apos;s queue automatically.</p>
      </header>

      <form onSubmit={handleSignup} className="space-y-8 bg-white/70 backdrop-blur border border-gray-200 rounded-xl p-6 shadow-sm">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Clinic Name</label>
              <input value={clinicName} onChange={e=>setClinicName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Sunrise Health Center" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Doctor Name</label>
              <input value={doctorName} onChange={e=>setDoctorName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Dr. Anita Rao" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Specialty</label>
              <input value={specialty} onChange={e=>setSpecialty(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Pediatrics" required />
            </div>
            <div className="pt-2 flex justify-end">
              <button type="button" disabled={!canContinueStep1} onClick={()=>setStep(2)} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40">Continue</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-gray-700 uppercase">Account Credentials</h2>
              <button type="button" onClick={()=>setStep(1)} className="text-xs text-gray-600 underline">Back</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="you@clinic.com" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Password (min 6 chars)</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="••••••••" required minLength={6} />
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
            <button disabled={!canSubmit || loading} className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold tracking-wide disabled:opacity-40">{loading ? 'Creating...' : 'Create Clinic & Continue'}</button>
          </div>
        )}
      </form>

      {process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' && (
        <div className="space-y-3 text-center">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Development</div>
          <button onClick={handleCreateDemo} disabled={demoCreating} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40">{demoCreating ? 'Creating Demo...' : 'Create Demo Clinic Instantly'}</button>
          <p className="text-[11px] text-gray-500 max-w-xs mx-auto">Generates a disposable account with a ready clinic, doctor & queue.</p>
        </div>
      )}
    </div>
  );
}
