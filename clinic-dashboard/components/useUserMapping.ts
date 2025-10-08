"use client";
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';

export interface UserMapping {
  clinicId?: string;
  doctorId?: string;
  clinicName?: string;
  doctorName?: string;
  specialty?: string;
}

interface MappingState {
  email: string | null;
  mapping: UserMapping | null;
  loading: boolean;
}

export function useUserMapping(): MappingState {
  const [email, setEmail] = useState<string | null>(null);
  const [mapping, setMapping] = useState<UserMapping | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubMap: (() => void) | null = null;
    const unsubAuth = auth.onAuthStateChanged(u => {
      // Tear down previous listener when auth state changes
      if (unsubMap) { try { unsubMap(); } catch {} finally { unsubMap = null; } }
      setEmail(u?.email ?? null);
      if (!u) {
        setMapping(null);
        setLoading(false);
        return;
      }
      const ref = doc(db, 'users', u.uid);
      unsubMap = onSnapshot(
        ref,
        snap => {
          setMapping(snap.exists() ? (snap.data() as UserMapping) : null);
          setLoading(false);
        },
        (error) => {
          // This can trigger during sign-out as auth becomes null -> permission-denied.
          if ((error as any)?.code === 'permission-denied') {
            setMapping(null);
          }
          setLoading(false);
        }
      );
    });
    return () => { try { unsubAuth(); } catch {}; if (unsubMap) { try { unsubMap(); } catch {} } };
  }, []);

  return { email, mapping, loading };
}
