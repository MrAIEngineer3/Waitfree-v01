"use client";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
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
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const mappingQueryKey = useMemo(() => ['user-mapping', uid ?? ''] as const, [uid]);

  const mappingQuery = useQuery<UserMapping | null>({
    queryKey: mappingQueryKey,
    enabled: false,
    queryFn: async () => null,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      queryClient.removeQueries({ queryKey: ['user-mapping'], exact: false });
      setEmail(user?.email ?? null);
      if (!user) {
        setUid(null);
        setLoading(false);
        return;
      }

      setUid(user.uid);
      setLoading(true);
    });

    return () => {
      unsubscribeAuth();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!uid) {
      queryClient.setQueryData(mappingQueryKey, null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const nextMapping = snap.exists() ? (snap.data() as UserMapping) : null;
        queryClient.setQueryData(mappingQueryKey, nextMapping);
        setLoading(false);
      },
      (error: FirestoreError) => {
        if (error.code === 'permission-denied') {
          queryClient.setQueryData(mappingQueryKey, null);
        }
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [uid, mappingQueryKey, queryClient]);

  const mapping = mappingQuery.data ?? null;

  return { email, mapping, loading };
}
