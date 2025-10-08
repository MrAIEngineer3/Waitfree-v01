"use client";

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { auth, functions } from '../../../lib/firebase';

interface BootstrapResult { success: boolean; clinicId: string; doctorId: string; queueId: string; }

export default function SignupPage() {
  const router = useRouter();
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCreating, setDemoCreating] = useState(false);

  const bootstrapFn = httpsCallable(functions, 'bootstrapClinicAccount');

  const canSubmit = clinicName.trim() && doctorName.trim() && specialty.trim() && email.trim() && password.length >= 6;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
  const res = await bootstrapFn({ clinicName: clinicName.trim(), doctorName: doctorName.trim(), specialty: specialty.trim() });
      const data = res.data as BootstrapResult;
      if (!data?.success) throw new Error('Bootstrap failed');
  router.replace('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign up';
      setError(message);
    } finally { setLoading(false); }
  }

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
  router.replace('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Demo creation failed';
      setError(message);
    } finally { setDemoCreating(false); }
  }

  return (
    <div className="max-w-2xl mx-auto w-full py-12 px-4 space-y-8">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create Your Clinic</h1>
        <p className="text-sm text-gray-600">One signup creates your clinic, primary doctor profile & today&apos;s queue.</p>
      </header>

      <Card padding="lg" variant="outline" className="space-y-6">
        <form onSubmit={handleSignup} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Clinic Name</label>
              <input value={clinicName} onChange={e=>setClinicName(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="e.g. Sunrise Health Center" required />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Doctor Name</label>
              <input value={doctorName} onChange={e=>setDoctorName(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="e.g. Dr. Anita Rao" required />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Specialty</label>
              <input value={specialty} onChange={e=>setSpecialty(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="e.g. Pediatrics" required />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="you@clinic.com" required />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Password (min 6 chars)</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="••••••••" required minLength={6} />
            </div>
          </div>
          {error && <div className="text-sm text-sem-danger bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
          <Button disabled={!canSubmit} loading={loading} type="submit" className="w-full">Create Clinic & Continue</Button>
        </form>
        {process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' && (
          <div className="pt-4 border-t border-sem-border space-y-3 text-center">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Development</div>
            <Button type="button" variant="outline" onClick={handleCreateDemo} loading={demoCreating} className="w-full">Create Demo Clinic Instantly</Button>
            <p className="text-[11px] text-gray-500 max-w-sm mx-auto">Generates a disposable account with a ready clinic, doctor & queue.</p>
          </div>
        )}
        <div className="text-center text-xs text-gray-600">
          Already have an account? <a href="/auth/login" className="text-brand-600 hover:underline font-medium">Sign in</a>
        </div>
      </Card>
    </div>
  );
}
