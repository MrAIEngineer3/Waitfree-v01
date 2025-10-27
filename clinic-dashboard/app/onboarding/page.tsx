"use client";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import { auth, db, functions } from '../../lib/firebase';

interface Mapping { clinicId?: string; doctorId?: string; }

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userMapping, setUserMapping] = useState<Mapping | null>(null);
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) { router.replace('/auth/login'); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) {
          const data = snap.data() as Mapping;
          if (data.clinicId && data.doctorId) {
            // Already onboarded
            router.replace('/');
            return;
          }
          setUserMapping(data);
        } else {
          setUserMapping({});
        }
      } finally { setLoading(false); }
    })();
  }, [router]);

  async function handleCreateStructures(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      const uid = user.uid;
      const bootstrap = httpsCallable(functions, 'bootstrapClinicAccount');
      const response = await bootstrap({
        clinicName: clinicName || 'New Clinic',
        doctorName: doctorName || 'Primary Doctor',
        specialty: specialty || 'General',
        clinicPhone: clinicPhone || undefined
      });

      const result = response.data as { success?: boolean; clinicId?: string; doctorId?: string };
      if (!result?.success) {
        throw new Error('Failed to create clinic structures');
      }

      const now = new Date().toISOString();
      await setDoc(
        doc(db, 'users', uid),
        {
          ...(userMapping || {}),
          clinicId: result.clinicId,
          doctorId: result.doctorId,
          email: user.email,
          createdAt: now
        },
        { merge: true }
      );
      router.replace('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(msg);
    } finally { setSaving(false); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">Loading onboarding...</div>;

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8">
      <header className="space-y-2 text-center">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Welcome to Waitfree</h1>
        <p className="text-sm text-gray-600">Set up your clinic & primary doctor to start managing queues.</p>
      </header>
      <Separator className="my-6" />
      <Card padding="lg" variant="outline" className="space-y-6">
        <form onSubmit={handleCreateStructures} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clinic-name" className="text-sm font-semibold text-gray-700">
                Clinic Name
              </Label>
              <Input 
                id="clinic-name"
                value={clinicName} 
                onChange={e=>setClinicName(e.target.value)} 
                placeholder="e.g. Sunrise Health Center"
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
            <div className="flex items-center gap-2 mb-3">
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
          
          <Button type="submit" className="w-full h-11" loading={saving}>
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Complete Setup
          </Button>
        </form>
        
        <Separator className="my-4" />
        
        <div className="text-xs text-gray-500 text-center bg-gray-50 rounded-lg p-3">
          <svg className="w-4 h-4 inline-block mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          If you already created these structures manually, they will be auto-detected next reload.
        </div>
      </Card>
    </div>
  );
}
