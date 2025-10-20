"use client";

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
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
      <header className="text-center space-y-3">
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create Your Clinic</h1>
        <p className="text-sm text-gray-600">Two quick steps to set up your clinic and doctor</p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <div className={`h-2 w-16 rounded-full transition-colors ${step === 1 ? 'bg-blue-500' : 'bg-gray-300'}`} />
          <div className={`h-2 w-16 rounded-full transition-colors ${step === 2 ? 'bg-blue-500' : 'bg-gray-300'}`} />
        </div>
      </header>

      <Card padding="lg" variant="outline" className="space-y-6 shadow-sm">
        {step === 1 && (
          <form onSubmit={(e)=>{ e.preventDefault(); if (canContinueStep1) setStep(2); }} className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <h3 className="text-base font-semibold text-gray-900">Clinic Information</h3>
              </div>
              <div className="space-y-2">
                <Label htmlFor="clinic-name" className="text-sm font-semibold text-gray-700">
                  Clinic Name
                </Label>
                <Input 
                  id="clinic-name"
                  value={clinicName} 
                  onChange={e=>setClinicName(e.target.value)} 
                  placeholder="e.g. Sunrise Health Center" 
                  required 
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clinic-phone" className="text-sm font-semibold text-gray-700">
                  Clinic Phone <span className="text-gray-500 font-normal">(optional)</span>
                </Label>
                <Input 
                  id="clinic-phone"
                  value={clinicPhone} 
                  onChange={e=>setClinicPhone(e.target.value)} 
                  placeholder="Contact number for patients"
                  className="h-10"
                />
              </div>
            </div>
            
            <Separator className="my-6" />
            
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <h3 className="text-base font-semibold text-gray-900">Account Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                    Email Address
                  </Label>
                  <Input 
                    id="email"
                    type="email" 
                    value={email} 
                    onChange={e=>setEmail(e.target.value)} 
                    placeholder="you@clinic.com" 
                    required 
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Password (min 6 chars)
                  </Label>
                  <Input 
                    id="password"
                    type="password" 
                    value={password} 
                    onChange={e=>setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    required 
                    minLength={6}
                    className="h-10"
                  />
                </div>
              </div>
            </div>
            
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            
            <Button disabled={!canContinueStep1} type="submit" className="w-full h-11">
              Continue to Doctor Setup
              <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <h3 className="text-base font-semibold text-gray-900">Primary Doctor</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="doctor-name" className="text-sm font-semibold text-gray-700">
                    Doctor Name
                  </Label>
                  <Input 
                    id="doctor-name"
                    value={doctorName} 
                    onChange={e=>setDoctorName(e.target.value)} 
                    placeholder="e.g. Dr. Anita Rao" 
                    required 
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialty" className="text-sm font-semibold text-gray-700">
                    Specialty
                  </Label>
                  <Input 
                    id="specialty"
                    value={specialty} 
                    onChange={e=>setSpecialty(e.target.value)} 
                    placeholder="e.g. Pediatrics" 
                    required 
                    className="h-10"
                  />
                </div>
              </div>
            </div>
            
            <Separator className="my-6" />
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h4 className="text-sm font-semibold text-gray-900">Additional Doctors</h4>
                  <span className="text-xs text-gray-500 font-normal">(optional)</span>
                </div>
              </div>
              {additionalDoctors.length === 0 && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <svg className="w-4 h-4 inline-block mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  You can add more doctors now or later from Settings → Doctors
                </div>
              )}
              {additionalDoctors.map((d, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-4 md:grid-cols-5 md:items-end border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor={`extra-doctor-name-${idx}`} className="text-xs font-semibold text-gray-700">
                      Name
                    </Label>
                    <Input 
                      id={`extra-doctor-name-${idx}`}
                      value={d.name} 
                      onChange={e=>{
                        const v = e.target.value; setAdditionalDoctors(list=> list.map((x,i)=> i===idx? { ...x, name: v }: x));
                      }} 
                      placeholder="e.g. Dr. Lee"
                      className="h-9"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor={`extra-doctor-specialty-${idx}`} className="text-xs font-semibold text-gray-700">
                      Specialty
                    </Label>
                    <Input 
                      id={`extra-doctor-specialty-${idx}`}
                      value={d.specialty} 
                      onChange={e=>{
                        const v = e.target.value; setAdditionalDoctors(list=> list.map((x,i)=> i===idx? { ...x, specialty: v }: x));
                      }} 
                      placeholder="e.g. Dermatology"
                      className="h-9"
                    />
                  </div>
                  <div className="flex gap-2 md:justify-end">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="w-full md:w-auto" 
                      onClick={()=> setAdditionalDoctors(list=> list.toSpliced(idx, 1))}
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="w-full sm:w-auto border-blue-300 text-blue-600 hover:bg-blue-50" 
                onClick={()=> setAdditionalDoctors(list=> [...list, { name: '', specialty: '' }])}
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Another Doctor
              </Button>
            </div>
            
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={()=>setStep(1)} 
                className="w-full sm:w-auto sm:min-w-[6.5rem]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </Button>
              <Button 
                disabled={!canSubmit} 
                loading={loading} 
                type="submit" 
                className="w-full sm:flex-1 h-11"
              >
                {!loading && (
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Create Clinic & Continue
              </Button>
            </div>
          </form>
        )}

        {process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' && step === 1 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Development Mode</div>
              </div>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCreateDemo} 
                loading={demoCreating} 
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Create Demo Clinic Instantly
              </Button>
              <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                Generates a disposable account with a ready clinic, doctor & queue
              </p>
            </div>
          </>
        )}

        <Separator className="my-4" />
        
        <div className="text-center text-sm text-gray-600">
          <span className="mr-1">Already have an account?</span>
          <a href="/auth/login" className="text-blue-600 hover:text-blue-700 hover:underline font-semibold transition-colors">
            Sign in
          </a>
        </div>
      </Card>
    </div>
  );
}
