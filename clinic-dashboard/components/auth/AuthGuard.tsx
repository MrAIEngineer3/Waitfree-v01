"use client";
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { auth, db } from '../../lib/firebase';

/**
 * AuthGuard
 * Responsibilities:
 *  - Wait for Firebase auth to initialize
 *  - If no user: redirect to /auth/login
 *  - If user but missing clinicId/doctorId mapping: redirect to /onboarding
 *  - Else render children (protected dashboard experience)
 *
 * NOTE: This is intentionally conservative: it only runs for routes placed inside the (dashboard) group layout.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [mappingChecked, setMappingChecked] = useState(false);
  const [guardError, setGuardError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    setGuardError(null);
    setMappingChecked(false);
    const unsub = onAuthStateChanged(auth, async (u) => {
      const activePath = pathnameRef.current;

      if (!u) {
        setGuardError(null);
        setMappingChecked(true);
        if (!activePath.startsWith('/auth')) router.replace('/auth/login');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const data = snap.exists() ? snap.data() as { clinicId?: string; doctorId?: string } : {};
        if (!data.clinicId || !data.doctorId) {
          // Only redirect if not already on onboarding
          if (!activePath.startsWith('/onboarding')) router.replace('/onboarding');
        }
        setGuardError(null);
      } catch (err) {
        console.error('AuthGuard failed to fetch user mapping', err);
        setGuardError('We were unable to verify your clinic access. Please retry or sign out.');
      } finally {
        setMappingChecked(true);
      }
    });
    return () => unsub();
  }, [router, retryNonce]);

  const handleRetry = () => {
    setGuardError(null);
    setMappingChecked(false);
    setRetryNonce((token) => token + 1);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } finally {
      setGuardError(null);
      setMappingChecked(false);
      router.replace('/auth/login');
    }
  };

  if (!mappingChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-sm text-muted-foreground">
        <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-600 rounded-full animate-spin" />
        <div className="text-xs tracking-wide uppercase font-medium text-muted-foreground">Checking authentication</div>
      </div>
    );
  }

  if (guardError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center text-sm text-muted-foreground px-6">
        <div className="text-base font-medium text-foreground">We couldn&apos;t confirm your access</div>
        <div className="max-w-sm text-muted-foreground">{guardError}</div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
