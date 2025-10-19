"use client";

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { auth, db, functions } from '../../../lib/firebase';

interface BootstrapResult { success: boolean; clinicId: string; doctorId: string; queueId: string; }

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [additionalDoctors, setAdditionalDoctors] = useState<Array<{ name: string; specialty: string }>>([]);
  const [clinicPhone, setClinicPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCreating, setDemoCreating] = useState(false);

  const bootstrapFn = httpsCallable(functions, 'bootstrapClinicAccount');

  const canContinueStep1 = clinicName.trim() && email.trim() && password.length >= 6;
  const canSubmit = doctorName.trim() && specialty.trim() && canContinueStep1;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      const res = await bootstrapFn({ clinicName: clinicName.trim(), doctorName: doctorName.trim(), specialty: specialty.trim(), clinicPhone: clinicPhone.trim() || undefined });
      const data = res.data as BootstrapResult;
      if (!data?.success) throw new Error('Bootstrap failed');
      // Optionally create additional doctors
      const extra = additionalDoctors.filter(d => d.name.trim() && d.specialty.trim());
      if (extra.length > 0) {
        const clinicId = data.clinicId;
        const colRef = collection(db, 'clinics', clinicId, 'doctors');
        const now = new Date().toISOString();
        for (const d of extra) {
          await addDoc(colRef, { name: d.name.trim(), specialty: d.specialty.trim(), clinicId, createdAt: now });
        }
      }
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
  const res = await bootstrapFn({ clinicName: demoClinic, doctorName: demoDoctor, specialty: demoSpecialty, clinicPhone: '' });
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
        <p className="text-sm text-gray-600">Two quick steps to set up your clinic and doctor.</p>
      </header>

      <Card padding="lg" variant="outline" className="space-y-6">
        {step === 1 && (
          <form onSubmit={(e)=>{ e.preventDefault(); if (canContinueStep1) setStep(2); }} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Clinic Name</label>
                <Input value={clinicName} onChange={e=>setClinicName(e.target.value)} placeholder="e.g. Sunrise Health Center" required />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Clinic Phone (optional)</label>
                <Input value={clinicPhone} onChange={e=>setClinicPhone(e.target.value)} placeholder="Contact number for patients" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Email</label>
                <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@clinic.com" required />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Password (min 6 chars)</label>
                <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            </div>
            {error && <div className="text-sm text-sem-danger bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
            <Button disabled={!canContinueStep1} type="submit" className="w-full">Continue</Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSignup} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Doctor Name</label>
                <Input value={doctorName} onChange={e=>setDoctorName(e.target.value)} placeholder="e.g. Dr. Anita Rao" required />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Specialty</label>
                <Input value={specialty} onChange={e=>setSpecialty(e.target.value)} placeholder="e.g. Pediatrics" required />
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-800">Additional Doctors (optional)</div>
              {additionalDoctors.length === 0 && (
                <div className="text-xs text-gray-600">You can add more doctors now or later from Settings → Doctors.</div>
              )}
              {additionalDoctors.map((d, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Name</label>
                    <Input value={d.name} onChange={e=>{
                      const v = e.target.value; setAdditionalDoctors(list=> list.map((x,i)=> i===idx? { ...x, name: v }: x));
                    }} placeholder="e.g. Dr. Lee" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Specialty</label>
                    <Input value={d.specialty} onChange={e=>{
                      const v = e.target.value; setAdditionalDoctors(list=> list.map((x,i)=> i===idx? { ...x, specialty: v }: x));
                    }} placeholder="e.g. Dermatology" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={()=> setAdditionalDoctors(list=> list.toSpliced(idx, 1))}>Remove</Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="accent" size="sm" onClick={()=> setAdditionalDoctors(list=> [...list, { name: '', specialty: '' }])}>Add another doctor</Button>
            </div>
            {error && <div className="text-sm text-sem-danger bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={()=>setStep(1)} className="w-1/3">Back</Button>
              <Button disabled={!canSubmit} loading={loading} type="submit" className="flex-1">Create Clinic & Continue</Button>
            </div>
          </form>
        )}

        {process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' && step === 1 && (
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
