"use client";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot, Timestamp, Unsubscribe } from 'firebase/firestore';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { clearCachedValue, clearClinicCache, prefetchValue, setCachedValue } from '../lib/settingsCache';
import type { NotificationSettingsDoc } from '../types/settings';
import ClinicContext from './ClinicContext';

type QueueStatus = 'active' | 'paused' | 'ended';
type FirestoreTimestamp = Timestamp | { seconds: number; nanoseconds: number } | null;

interface DoctorRecord {
  name?: string;
  specialty?: string | null;
  clinicId?: string;
  email?: string | null;
  phone?: string | null;
  createdAt?: FirestoreTimestamp;
  scheduling?: DoctorSchedulingRecord | null;
}

interface QueueRecord {
  doctorId?: string;
  clinicId?: string;
  status?: QueueStatus;
  currentToken?: number;
  totalPatients?: number;
  completedPatients?: number;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  autoAdvance?: boolean;
}

interface UserRecord {
  clinicId?: string;
  doctorId?: string;
  photoURL?: string | null;
}

interface ClinicRecord {
  name?: string | null;
  displaySlug?: string | null;
}

interface ClinicInfo {
  id: string;
  name: string | null;
  slug: string | null;
  shareCode: string | null;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string | null;
  clinicId: string;
  email?: string | null;
  phone?: string | null;
  createdAt?: FirestoreTimestamp;
}

interface Queue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: QueueStatus;
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  autoAdvance?: boolean;
}

interface ClinicContextProviderProps {
  children: React.ReactNode;
}

const detach = (unsubscribe: Unsubscribe | null): null => {
  if (unsubscribe) {
    unsubscribe();
  }
  return null;
};

const isPermissionDeniedError = (value: unknown): value is { code: string } =>
  typeof value === 'object'
  && value !== null
  && 'code' in value
  && (value as { code: unknown }).code === 'permission-denied';

export interface DoctorRealtimeStatusRecord {
  online?: boolean;
  updatedAt?: FirestoreTimestamp;
  note?: string | null;
  source?: string | null;
}

export interface DoctorSchedulingRecord {
  timeZone?: string | null;
  defaultRota?: unknown;
  realTimeStatus?: DoctorRealtimeStatusRecord | null;
}

export interface ClinicDoctorListEntry {
  id: string;
  clinicId: string;
  name: string;
  specialty: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt?: FirestoreTimestamp;
  scheduling?: DoctorSchedulingRecord | null;
}

export default function ClinicContextProvider({ children }: ClinicContextProviderProps) {
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [clinicShareCode, setClinicShareCode] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [doctorPhotoURL, setDoctorPhotoURL] = useState<string | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsDoc | null | undefined>(undefined);
  const todayKey = new Date().toISOString().split('T')[0];
  const attemptedCreateRef = useRef<Set<string>>(new Set());
  const latestClinicRef = useRef<string | null>(null);
  const shareCodeRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestShareCodeRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const clearShareCodeRetry = useCallback(() => {
    if (shareCodeRetryRef.current) {
      clearTimeout(shareCodeRetryRef.current);
      shareCodeRetryRef.current = null;
    }
  }, []);

  const resetClinicScopedState = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['clinic'], exact: false });
    queryClient.removeQueries({ queryKey: ['doctor'], exact: false });
    queryClient.removeQueries({ queryKey: ['queue'], exact: false });
    queryClient.removeQueries({ queryKey: ['patients'], exact: false });
    queryClient.removeQueries({ queryKey: ['doctors'], exact: false });
    attemptedCreateRef.current.clear();
    latestShareCodeRef.current = null;
    clearShareCodeRetry();
    setClinicShareCode(null);
    setDoctorPhotoURL(null);
    setNotificationSettings(undefined);
  }, [queryClient, clearShareCodeRetry]);

  const loadNotificationSettings = useCallback(async (clinic: string) => {
    const path = ['clinics', clinic, 'settings', 'notifications'];
    try {
      const data = await prefetchValue<NotificationSettingsDoc | null>(
        path,
        async () => {
          const ref = doc(db, 'clinics', clinic, 'settings', 'notifications');
          const snap = await getDoc(ref);
          return snap.exists() ? (snap.data() as NotificationSettingsDoc) : null;
        },
        { freshMs: 5 * 60_000 }
      );
      if (latestClinicRef.current === clinic) {
        setNotificationSettings(data ?? null);
      }
    } catch (error) {
      setCachedValue(path, null);
      if (latestClinicRef.current === clinic) {
        setNotificationSettings(null);
      }
      if (process.env.NODE_ENV === 'development') {
        const reason = isPermissionDeniedError(error) ? 'permission-denied' : 'unknown';
        console.warn('[ClinicContext] Failed to prefetch notification settings', reason, error);
      }
    }
  }, []);

  const loadClinicShareCode = useCallback(async (clinic: string) => {
    const key = ['clinicShareCodes', clinic];
    const toMillis = (value: unknown): number | null => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      const withToMillis = value as { toMillis?: () => number };
      if (typeof withToMillis.toMillis === 'function') {
        try {
          return withToMillis.toMillis();
        } catch {
          return null;
        }
      }
      const seconds = (value as { seconds?: unknown }).seconds;
      if (typeof seconds === 'number') {
        const nanosecondsRaw = (value as { nanoseconds?: unknown }).nanoseconds;
        const nanoseconds = typeof nanosecondsRaw === 'number' ? nanosecondsRaw : 0;
        return seconds * 1_000 + Math.floor(nanoseconds / 1_000_000);
      }
      if (value instanceof Date) {
        return value.getTime();
      }
      return null;
    };

    const findActiveShareCode = (rows: Array<{ id: string; data: Record<string, unknown> | undefined }>) => {
      let bestId: string | null = null;
      let bestPriority = -1;
      let bestTimestamp = -1;

      for (const row of rows) {
        const data = row.data ?? {};
        const statusRaw = typeof data.status === 'string' ? data.status.toLowerCase() : 'active';
        const disabled = data.disabled === true;
        if (disabled || statusRaw === 'disabled' || statusRaw === 'revoked') {
          continue;
        }

        const issuedBy = typeof (data as { issuedBy?: unknown }).issuedBy === 'string';
        const issuedAtValue = (data as { issuedAt?: unknown }).issuedAt;
        const updatedAtValue = (data as { updatedAt?: unknown }).updatedAt;
        const issuedAt = toMillis(issuedAtValue);
        const updatedAt = toMillis(updatedAtValue);

        const priority = issuedBy ? 3 : issuedAt !== null ? 2 : 1;
        const latestTimestamp = issuedAt ?? updatedAt ?? 0;

        if (
          bestId === null
          || priority > bestPriority
          || (priority === bestPriority && latestTimestamp > bestTimestamp)
        ) {
          bestId = row.id;
          bestPriority = priority;
          bestTimestamp = latestTimestamp;
        }
      }

      return bestId;
    };

    try {
      const code = await prefetchValue<string | null>(
        key,
        async () => {
          const codes = collection(db, 'clinicShareCodes');
          const canonicalQuery = query(codes, where('canonicalClinicId', '==', clinic), limit(5));
          const canonicalSnap = await getDocs(canonicalQuery);
          return findActiveShareCode(canonicalSnap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() as Record<string, unknown> | undefined })));
        },
        { freshMs: 5 * 60_000 }
      );

      if (latestClinicRef.current === clinic) {
        if (code) {
          const normalized = code.toUpperCase();
          if (shareCodeRetryRef.current) {
            clearTimeout(shareCodeRetryRef.current);
            shareCodeRetryRef.current = null;
          }
          setCachedValue(key, normalized);
          setClinicShareCode((prev) => (prev === normalized ? prev : normalized));
        } else if (!latestShareCodeRef.current) {
          clearCachedValue(key);
          if (shareCodeRetryRef.current) {
            clearTimeout(shareCodeRetryRef.current);
          }
          shareCodeRetryRef.current = setTimeout(() => {
            if (latestClinicRef.current === clinic) {
              void loadClinicShareCode(clinic);
            }
          }, 2000);
        }
      }
    } catch (error) {
      clearCachedValue(key);
      if (!latestShareCodeRef.current) {
        if (shareCodeRetryRef.current) {
          clearTimeout(shareCodeRetryRef.current);
        }
        shareCodeRetryRef.current = setTimeout(() => {
          if (latestClinicRef.current === clinic) {
            void loadClinicShareCode(clinic);
          }
        }, 4000);
        if (latestClinicRef.current === clinic) {
          setClinicShareCode(null);
        }
      }
      if (process.env.NODE_ENV === 'development') {
        const reason = isPermissionDeniedError(error) ? 'permission-denied' : 'unknown';
        console.warn('[ClinicContext] Failed to load clinic share code', reason, error);
      }
    }
  }, []);

  const refreshNotificationSettings = useCallback(async () => {
    if (!clinicId) {
      return;
    }
    const path = ['clinics', clinicId, 'settings', 'notifications'];
    try {
        const ref = doc(db, 'clinics', clinicId, 'settings', 'notifications');
        const snap = await getDoc(ref);
        const next = snap.exists() ? (snap.data() as NotificationSettingsDoc) : null;
        setCachedValue(path, next);
      if (latestClinicRef.current === clinicId) {
        setNotificationSettings(next);
      }
    } catch (error) {
      setCachedValue(path, null);
      if (latestClinicRef.current === clinicId) {
        setNotificationSettings(null);
      }
      if (process.env.NODE_ENV === 'development') {
        const reason = isPermissionDeniedError(error) ? 'permission-denied' : 'unknown';
        console.warn('[ClinicContext] Failed to refresh notification settings', reason, error);
      }
    }
  }, [clinicId]);

  const clinicQueryKey = useMemo(() => ['clinic', clinicId ?? ''] as const, [clinicId]);
  const doctorQueryKey = useMemo(
    () => ['doctor', clinicId ?? '', doctorId ?? ''] as const,
    [clinicId, doctorId]
  );
  const queueQueryKey = useMemo(
    () => ['queue', clinicId ?? '', doctorId ?? '', todayKey] as const,
    [clinicId, doctorId, todayKey]
  );
  const doctorsQueryKey = useMemo(
    () => ['doctors', clinicId ?? ''] as const,
    [clinicId]
  );

  const ensureQueueDocument = useCallback(
    async (clinic: string, doctor: string) => {
      const cacheKey = `${clinic}/${doctor}/${todayKey}`;
      if (attemptedCreateRef.current.has(cacheKey)) {
        return;
      }
      attemptedCreateRef.current.add(cacheKey);
      try {
        const queueRef = doc(db, 'clinics', clinic, 'doctors', doctor, 'queues', todayKey);
        await setDoc(
          queueRef,
          {
            status: 'active',
            currentToken: 0,
            totalPatients: 0,
            completedPatients: 0,
            autoAdvance: true,
            createdAt: serverTimestamp(),
            clinicId: clinic,
            doctorId: doctor,
          },
          { merge: true }
        );
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ClinicContext] Failed to create queue document', error);
        }
      }
    },
    [todayKey]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let unsubscribeUserDoc: Unsubscribe | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeUserDoc = detach(unsubscribeUserDoc);

      if (!user) {
        if (latestClinicRef.current) {
          clearClinicCache(latestClinicRef.current);
        }
        latestClinicRef.current = null;
        setClinicId(null);
        setDoctorId(null);
        setDoctorPhotoURL(null);
        resetClinicScopedState();
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      unsubscribeUserDoc = onSnapshot(userRef, (userSnap) => {
        const data = (userSnap.data() as UserRecord | undefined) ?? {};
        const nextClinicId = data.clinicId ?? null;
        const nextDoctorId = data.doctorId ?? null;
        const nextPhotoURL = typeof data.photoURL === 'string' && data.photoURL.trim().length > 0
          ? data.photoURL
          : user.photoURL ?? null;

        setClinicId(nextClinicId);
        setDoctorId(nextDoctorId);
        setDoctorPhotoURL(nextPhotoURL);

        if (!nextClinicId || !nextDoctorId) {
          if (latestClinicRef.current) {
            clearClinicCache(latestClinicRef.current);
          }
          latestClinicRef.current = null;
          resetClinicScopedState();
          return;
        }

        if (latestClinicRef.current && latestClinicRef.current !== nextClinicId) {
          clearClinicCache(latestClinicRef.current);
        }

        if (latestClinicRef.current !== nextClinicId) {
          resetClinicScopedState();
          void loadNotificationSettings(nextClinicId);
          void loadClinicShareCode(nextClinicId);
        }

        latestClinicRef.current = nextClinicId;
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUserDoc = detach(unsubscribeUserDoc);
      clearShareCodeRetry();
    };
  }, [clearShareCodeRetry, loadClinicShareCode, loadNotificationSettings, resetClinicScopedState]);

  const clinicQuery = useQuery<ClinicInfo | null>({
    queryKey: clinicQueryKey,
    enabled: Boolean(clinicId),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const clinicRef = doc(db, 'clinics', clinicId!);
      const snapshot = await getDoc(clinicRef);
      if (!snapshot.exists()) {
        return null;
      }
      return buildClinicFromSnapshot(snapshot);
    },
  });

  const doctorQuery = useQuery<Doctor | null>({
    queryKey: doctorQueryKey,
    enabled: Boolean(clinicId && doctorId),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const doctorRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!);
      const snapshot = await getDoc(doctorRef);
      if (!snapshot.exists()) {
        return null;
      }
      return buildDoctorFromSnapshot(snapshot, { clinicId: clinicId! });
    },
  });

  const queueQuery = useQuery<Queue | null>({
    queryKey: queueQueryKey,
    enabled: Boolean(clinicId && doctorId),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const queueRef = doc(db, 'clinics', clinicId!, 'doctors', doctorId!, 'queues', todayKey);
      const snapshot = await getDoc(queueRef);
      if (!snapshot.exists()) {
        await ensureQueueDocument(clinicId!, doctorId!);
        return null;
      }
      return buildQueueFromSnapshot(snapshot, { clinicId: clinicId!, doctorId: doctorId! });
    },
  });

  useEffect(() => {
    if (!clinicId) {
      queryClient.setQueryData<ClinicDoctorListEntry[]>(doctorsQueryKey, []);
      return;
    }

    const doctorsRef = collection(db, 'clinics', clinicId, 'doctors');
    const doctorsQuery = query(doctorsRef, orderBy('name'));

    const unsubscribe = onSnapshot(
      doctorsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => buildClinicDoctorListEntry(docSnap, clinicId));
        queryClient.setQueryData<ClinicDoctorListEntry[]>(doctorsQueryKey, next);
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ClinicContext] Doctors listener error', error);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [clinicId, doctorsQueryKey, queryClient]);

  useEffect(() => {
    if (!clinicId) {
      return;
    }

    const cacheKey: string[] = ['clinicShareCodes', clinicId];
    const clinicRef = doc(db, 'clinics', clinicId);

    const unsubscribe = onSnapshot(
      clinicRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          queryClient.setQueryData<ClinicInfo | null>(clinicQueryKey, null);
          latestShareCodeRef.current = null;
          setClinicShareCode(null);
          clearCachedValue(cacheKey);
          return;
        }

        const nextClinic = buildClinicFromSnapshot(snapshot);
        queryClient.setQueryData<ClinicInfo | null>(clinicQueryKey, nextClinic);

        const shareCode = nextClinic.shareCode?.trim() ?? '';
        if (shareCode) {
          const normalized = shareCode.toUpperCase();
          latestShareCodeRef.current = normalized;
          clearShareCodeRetry();
          setCachedValue(cacheKey, normalized);
          setClinicShareCode((prev) => (prev === normalized ? prev : normalized));
        } else if (!latestShareCodeRef.current) {
          clearCachedValue(cacheKey);
          setClinicShareCode(null);
        }
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ClinicContext] Clinic listener error', error);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [clinicId, clinicQueryKey, queryClient, clearShareCodeRetry]);

  useEffect(() => {
    if (!clinicId || !doctorId) {
      return;
    }

    const doctorRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);

    const unsubscribe = onSnapshot(
      doctorRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          queryClient.setQueryData<Doctor | null>(doctorQueryKey, null);
          return;
        }

        const nextDoctor = buildDoctorFromSnapshot(snapshot, { clinicId });
        queryClient.setQueryData<Doctor | null>(doctorQueryKey, nextDoctor);
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ClinicContext] Doctor listener error', error);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [clinicId, doctorId, doctorQueryKey, queryClient]);

  useEffect(() => {
    if (!clinicId || !doctorId) {
      return;
    }

    const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', todayKey);

    const unsubscribe = onSnapshot(
      queueRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          queryClient.setQueryData<Queue | null>(queueQueryKey, null);
          await ensureQueueDocument(clinicId, doctorId);
          return;
        }

        const nextQueue = buildQueueFromSnapshot(snapshot, { clinicId, doctorId });
        queryClient.setQueryData<Queue | null>(queueQueryKey, nextQueue);
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ClinicContext] Queue listener error', error);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [clinicId, doctorId, ensureQueueDocument, queueQueryKey, queryClient, todayKey]);

  useEffect(() => {
    latestShareCodeRef.current = clinicShareCode;
  }, [clinicShareCode]);

  const clinicName = clinicQuery.data?.name ?? null;
  const doctor = doctorQuery.data ?? null;
  const queue = queueQuery.data ?? null;
  const clinicSlug = clinicQuery.data?.slug ?? null;

  const contextValue = useMemo(
    () => ({
      clinicId,
      clinicSlug,
      clinicShareCode,
      clinicName,
      doctorId,
      doctorName: doctor?.name ?? null,
      doctorSpecialty: doctor?.specialty ?? null,
      doctorPhotoURL,
      queueStatus: queue?.status,
      queue,
      notificationSettings,
      reloadNotificationSettings: clinicId ? refreshNotificationSettings : null,
    }),
    [clinicId, clinicSlug, clinicShareCode, clinicName, doctor?.name, doctor?.specialty, doctorId, doctorPhotoURL, queue, notificationSettings, refreshNotificationSettings]
  );

  return <ClinicContext.Provider value={contextValue}>{children}</ClinicContext.Provider>;
}

function buildClinicFromSnapshot(snapshot: DocumentSnapshot<DocumentData>): ClinicInfo {
  const data = (snapshot.data() as ClinicRecord | undefined) ?? {};
  const shareCodeValue = (data as { shareCode?: unknown }).shareCode;
  const shareCode = typeof shareCodeValue === 'string' ? shareCodeValue : null;
  const slugValue = (data as { displaySlug?: unknown }).displaySlug;
  const slug = typeof slugValue === 'string' ? slugValue : null;

  return {
    id: snapshot.id,
    name: typeof data.name === 'string' ? data.name : null,
    slug,
    shareCode,
  };
}

function buildDoctorFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  fallback: { clinicId: string }
): Doctor {
  const doctorData = (snapshot.data() as DoctorRecord | undefined) ?? {};
  return {
    id: snapshot.id,
    name: doctorData.name ?? '',
    specialty: doctorData.specialty ?? null,
    clinicId: doctorData.clinicId ?? fallback.clinicId,
    email: doctorData.email ?? null,
    phone: doctorData.phone ?? null,
    createdAt: doctorData.createdAt ?? null,
  };
}

function buildQueueFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  defaults: { clinicId: string; doctorId: string }
): Queue {
  const data = (snapshot.data() as QueueRecord | undefined) ?? {};
  return {
    id: snapshot.id,
    doctorId: data.doctorId ?? defaults.doctorId,
    clinicId: data.clinicId ?? defaults.clinicId,
    status: data.status ?? 'active',
    currentToken: data.currentToken ?? 0,
    totalPatients: data.totalPatients ?? 0,
    completedPatients: data.completedPatients ?? 0,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    autoAdvance: data.autoAdvance ?? true,
  };
}

function buildClinicDoctorListEntry(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  clinicId: string
): ClinicDoctorListEntry {
  const raw = (snapshot.data() as DoctorRecord | undefined) ?? {};
  const scheduling = (raw.scheduling ?? null) as DoctorSchedulingRecord | null;

  return {
    id: snapshot.id,
    clinicId: raw.clinicId ?? clinicId,
    name: typeof raw.name === 'string' ? raw.name : '',
    specialty: typeof raw.specialty === 'string' ? raw.specialty : null,
    email: typeof raw.email === 'string' ? raw.email : null,
    phone: typeof raw.phone === 'string' ? raw.phone : null,
    createdAt: raw.createdAt ?? null,
    scheduling,
  };
}
