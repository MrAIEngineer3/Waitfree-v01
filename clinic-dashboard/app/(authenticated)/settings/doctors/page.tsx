"use client";
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { db } from '@/lib/firebase';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { useClinicContext } from '@/components/ClinicContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  email?: string;
  phone?: string;
  clinicId: string;
  createdAt?: string;
}

type DoctorRecord = Omit<Doctor, 'id'>;

export default function DoctorsSettingsPage() {
  const { clinicId } = useClinicContext();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', specialty: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  // const [confirm, setConfirm] = useState<{ open: boolean; id?: string; name?: string }>({ open: false });

  const doctorsCol = useMemo(() => (clinicId ? collection(db, 'clinics', clinicId, 'doctors') : null), [clinicId]);

  useEffect(() => {
    if (!doctorsCol) {
      setDoctors([]);
      setLoading(false);
      return;
    }
    const q = query(doctorsCol, orderBy('name'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Doctor[] = [];
        snap.forEach((d) => {
          const data = d.data() as Partial<DoctorRecord>;
          list.push({
            id: d.id,
            clinicId: clinicId!,
            name: data.name ?? '',
            specialty: data.specialty ?? '',
            email: data.email ?? undefined,
            phone: data.phone ?? undefined,
            createdAt: data.createdAt,
          });
        });
        setDoctors(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load doctors');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [doctorsCol, clinicId]);

  function startAdd() {
    setEditing(null);
    setForm({ name: '', specialty: '', email: '', phone: '' });
    setAdding(true);
  }

  function startEdit(d: Doctor) {
    setEditing(d);
    setForm({ name: d.name, specialty: d.specialty, email: d.email || '', phone: d.phone || '' });
  }

  async function saveDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId || !doctorsCol) return;
    if (!form.name.trim() || !form.specialty.trim()) {
      setError('Name and specialty are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      if (editing) {
        await updateDoc(doc(db, 'clinics', clinicId, 'doctors', editing.id), {
          name: form.name.trim(),
          specialty: form.specialty.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
        });
      } else {
        await addDoc(doctorsCol, {
          name: form.name.trim(),
          specialty: form.specialty.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          clinicId,
          createdAt: now,
        });
      }
      setEditing(null);
      setAdding(false);
      setForm({ name: '', specialty: '', email: '', phone: '' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      setError(message || 'Failed to save doctor');
    } finally {
      setSaving(false);
    }
  }

  async function removeDoctor(id: string) {
    if (!clinicId) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'clinics', clinicId, 'doctors', id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      setError(message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header with Action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Medical Staff</h2>
          <p className="text-sm text-gray-600 mt-1">Manage doctors and medical professionals</p>
        </div>
        <Button onClick={startAdd} variant="accent">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Doctor
        </Button>
      </div>

      {!clinicId && (
        <Card variant="outline">
          <CardContent className="p-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Clinic Selected</h3>
              <p className="text-sm text-gray-600">Attach your account to a clinic to manage doctors.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Doctors Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading doctors…</span>
          </div>
        </div>
      ) : doctors.length === 0 && clinicId ? (
        <Card variant="outline">
          <CardContent className="p-6">
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Doctors Added</h3>
              <p className="text-sm text-gray-600 mb-6">Get started by adding your first medical professional</p>
              <Button onClick={startAdd} variant="default">
                Add Your First Doctor
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {doctors.map((d) => (
            <Card key={d.id} className="group hover:shadow-lg transition-all duration-300">
              <CardContent className="p-6 space-y-4">
                {/* Doctor Avatar */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg shadow-md">
                      {d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">{d.name}</h3>
                      <p className="text-sm text-violet-600 font-medium">{d.specialty}</p>
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                {(d.email || d.phone) && (
                  <div className="space-y-2 pt-2 border-t border-gray-100">
                    {d.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="truncate">{d.email}</span>
                      </div>
                    )}
                    {d.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>{d.phone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => startEdit(d)}
                    className="flex-1 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove doctor?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove <b>{d.name}</b>? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeDoctor(d.id)}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {(adding || !!editing) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-8 py-6">
              <h2 className="text-2xl font-semibold text-white">
                {editing ? 'Edit Doctor' : 'Add New Doctor'}
              </h2>
              <p className="text-sm text-violet-100 mt-1">
                {editing ? 'Update doctor information' : 'Fill in the details to add a new doctor'}
              </p>
            </div>

            <form onSubmit={saveDoctor} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Full Name
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="Dr. Jane Smith"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Specialty
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    value={form.specialty}
                    onChange={(e) => setForm((p) => ({ ...p, specialty: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="Cardiologist"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="doctor@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Phone Number
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                <Button type="submit" loading={saving} variant="default">
                  {editing ? 'Save Changes' : 'Add Doctor'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setAdding(false);
                    setForm({ name: '', specialty: '', email: '', phone: '' });
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}


    </div>
  );
}
