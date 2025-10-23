"use client";
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setMappingChecked(true);
        if (!pathname.startsWith('/auth')) router.replace('/auth/login');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const data = snap.exists() ? snap.data() as { clinicId?: string; doctorId?: string } : {};
        if (!data.clinicId || !data.doctorId) {
          // Only redirect if not already on onboarding
            if (!pathname.startsWith('/onboarding')) router.replace('/onboarding');
        }
      } catch {
        // Fail open to allow UI but most data listeners will show helpful messages
      } finally {
        setMappingChecked(true);
      }
    });
    return () => unsub();
  }, [router, pathname]);

  if (!mappingChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
        <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-600 rounded-full animate-spin" />
        <div className="text-xs tracking-wide uppercase font-medium text-muted-foreground">Checking authentication</div>
      </div>
    );
  }

  return <>{children}</>;
}
