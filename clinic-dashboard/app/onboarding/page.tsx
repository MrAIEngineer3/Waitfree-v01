"use client";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { auth, db } from '../../lib/firebase';

interface Mapping { clinicId?: string; doctorId?: string; }

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userMapping, setUserMapping] = useState<Mapping | null>(null);
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
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
      const clinicId = `clinic-${uid.slice(0,8)}`;
      const doctorId = `doctor-${uid.slice(0,8)}`;
      const now = new Date().toISOString();
      await setDoc(doc(db, 'clinics', clinicId), { name: clinicName || 'New Clinic', ownerUid: uid, createdAt: now });
      await setDoc(doc(db, 'clinics', clinicId, 'doctors', doctorId), { name: doctorName || 'Primary Doctor', specialty: specialty || 'General', clinicId, createdAt: now });
      await setDoc(doc(db, 'users', uid), { ...(userMapping || {}), clinicId, doctorId, email: user.email, createdAt: now }, { merge: true });
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
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Clinic Onboarding</h1>
        <p className="text-sm text-gray-600">Finish setting up your clinic & primary doctor to start managing queues.</p>
      </header>
      <Card padding="lg" variant="outline" className="space-y-6">
        <form onSubmit={handleCreateStructures} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Clinic Name</label>
              <input value={clinicName} onChange={e=>setClinicName(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="e.g. Sunrise Health Center" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Doctor Name</label>
              <input value={doctorName} onChange={e=>setDoctorName(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="e.g. Dr. Anita Rao" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Specialty</label>
              <input value={specialty} onChange={e=>setSpecialty(e.target.value)} className="w-full rounded-md border border-sem-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="e.g. Pediatrics" />
            </div>
          </div>
          {error && <div className="text-sm text-sem-danger bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
          <Button type="submit" className="w-full" loading={saving}>Complete Setup</Button>
        </form>
        <div className="text-xs text-gray-500 text-center">If you already created these structures manually, they will be auto-detected next reload.</div>
      </Card>
    </div>
  );
}
