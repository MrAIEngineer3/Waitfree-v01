"use client";
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { auth, db, storage } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';

const isAuthError = (value: unknown): value is { code: string; message?: string } =>
  typeof value === 'object' && value !== null && 'code' in value && typeof (value as { code: unknown }).code === 'string';

export default function ProfileSettingsPage() {
  const u = auth.currentUser;
  const [displayName, setDisplayName] = useState(u?.displayName || '');
  const [email, setEmail] = useState(u?.email || '');
  const [phone, setPhone] = useState('');
  const [photoURL, setPhotoURL] = useState(u?.photoURL || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const userDocRef = useMemo(() => (u ? doc(db, 'users', u.uid) : null), [u]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!userDocRef) return;
        const snap = await getDoc(userDocRef);
        if (mounted && snap.exists()) {
          const d = snap.data() as { phone?: string };
          if (d?.phone) setPhone(d.phone);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userDocRef]);

  async function handleUploadPhoto() {
    if (!file || !u) return;
    const path = `users/${u.uid}/profile.jpg`;
    const r = ref(storage, path);
    await uploadBytes(r, file, { contentType: file.type });
    const url = await getDownloadURL(r);
    await updateProfile(u, { photoURL: url });
    setPhotoURL(url);
    await setDoc(doc(db, 'users', u.uid), { photoURL: url }, { merge: true });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!u) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (file) await handleUploadPhoto();
      if (displayName !== (u.displayName || '')) {
        await updateProfile(u, { displayName: displayName.trim() });
      }
      if (email && email !== u.email) {
        try {
          await updateEmail(u, email.trim());
        } catch (rawError: unknown) {
          if (isAuthError(rawError) && rawError.code === 'auth/requires-recent-login') {
            const pw = prompt('Please re-enter your password to change email:') || '';
            if (!pw) throw rawError;
            const cred = EmailAuthProvider.credential(u.email || '', pw);
            await reauthenticateWithCredential(u, cred);
            await updateEmail(u, email.trim());
          } else {
            throw rawError;
          }
        }
      }
      if (userDocRef) {
        const updates: { phone: string | null } = { phone: phone.trim() || null };
        await setDoc(userDocRef, updates, { merge: true });
      }
      setSuccess('Profile updated successfully.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : isAuthError(err) ? err.message : undefined;
      setError(message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading profile…</span>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
          <svg className="w-6 h-6 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Profile Information</h1>
          <p className="text-sm text-muted-foreground mt-1">Update your personal details and contact information</p>
        </div>
      </div>

      <Separator />

      <Card padding="none" variant="outline" className="overflow-hidden">
        <form onSubmit={handleSave} className="p-8 space-y-8">
          {/* Photo Upload Section */}
          <div className="flex items-start gap-6">
            <div className="relative group">
              {photoURL ? (
                <div className="relative">
                  <Image
                    src={photoURL}
                    alt="Profile"
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-2xl object-cover border-2 border-border shadow-md"
                  />
                  <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="h-24 w-24 rounded-2xl bg-muted flex items-center justify-center border-2 border-border shadow-md">
                  <svg className="w-12 h-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <Label className="text-sm font-semibold text-foreground">Profile Photo</Label>
                <p className="text-xs text-muted-foreground mt-1">Upload a professional photo. JPG, PNG or GIF. Max 5MB.</p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="relative cursor-pointer">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                  <span className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors w-full sm:w-auto">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Choose File
                  </span>
                </label>
                {file && (
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm text-muted-foreground truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="display-name" className="text-sm font-semibold text-foreground">
                Display Name
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Dr. John Doe"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Email Address
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="doctor@clinic.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="phone" className="text-sm font-semibold text-foreground">
                Phone Number
              </Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <p className="text-xs text-muted-foreground">Used for WhatsApp notifications and contact purposes</p>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-green-700 dark:text-green-400">{success}</span>
            </div>
          )}

          <Separator className="my-6" />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Button type="submit" loading={saving} variant="default" className="w-full sm:w-auto">
              Save Changes
            </Button>
            <Button 
              type="button" 
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setDisplayName(u?.displayName || '');
                setEmail(u?.email || '');
                setFile(null);
                setError(null);
                setSuccess(null);
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
