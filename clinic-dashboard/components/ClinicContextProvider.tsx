"use client";
import { onAuthStateChanged } from 'firebase/auth';
import type { Timestamp, Unsubscribe } from 'firebase/firestore';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
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
}

interface ClinicRecord {
  name?: string | null;
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

export default function ClinicContextProvider({ children }: ClinicContextProviderProps) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [clinicShareCode, setClinicShareCode] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsDoc | null | undefined>(undefined);
  const todayKey = new Date().toISOString().split('T')[0];
  const attemptedCreateRef = useRef<Set<string>>(new Set());
  const latestClinicRef = useRef<string | null>(null);
  const shareCodeRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestShareCodeRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let unsubscribeDoctor: Unsubscribe | null = null;
    let unsubscribeQueue: Unsubscribe | null = null;
    let unsubscribeClinic: Unsubscribe | null = null;
    let unsubscribeUserDoc: Unsubscribe | null = null;

    const attachQueueListener = (clinic: string, doctor: string, dayKey: string) => {
      unsubscribeQueue = detach(unsubscribeQueue);
      const queueRef = doc(db, 'clinics', clinic, 'doctors', doctor, 'queues', dayKey);
      unsubscribeQueue = onSnapshot(queueRef, async (snap) => {
        if (snap.exists()) {
          const data = (snap.data() as QueueRecord | undefined) ?? {};
          setQueue({
            id: snap.id,
            doctorId: data.doctorId ?? doctor,
            clinicId: data.clinicId ?? clinic,
            status: data.status ?? 'active',
            currentToken: data.currentToken ?? 0,
            totalPatients: data.totalPatients ?? 0,
            completedPatients: data.completedPatients ?? 0,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
            autoAdvance: data.autoAdvance ?? true,
          });
          return;
        }

        setQueue(null);

        if (dayKey !== todayKey) {
          return;
        }

        const key = `${clinic}/${doctor}/${dayKey}`;
        if (attemptedCreateRef.current.has(key)) {
          return;
        }

        attemptedCreateRef.current.add(key);
        try {
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
        } catch {
          // Non-fatal; queue controls will stay disabled if creation fails.
        }
      });
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeDoctor = detach(unsubscribeDoctor);
      unsubscribeQueue = detach(unsubscribeQueue);
      unsubscribeClinic = detach(unsubscribeClinic);
      unsubscribeUserDoc = detach(unsubscribeUserDoc);

      if (!user) {
        if (latestClinicRef.current) {
          clearClinicCache(latestClinicRef.current);
        }
        latestClinicRef.current = null;
        if (shareCodeRetryRef.current) {
          clearTimeout(shareCodeRetryRef.current);
          shareCodeRetryRef.current = null;
        }
        setClinicId(null);
        setClinicShareCode(null);
        setDoctorId(null);
        setDoctor(null);
          setQueue(null);
          setClinicName(null);
          setNotificationSettings(undefined);
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      unsubscribeUserDoc = onSnapshot(userRef, (userSnap) => {
        const data = (userSnap.data() as UserRecord | undefined) ?? {};
        const nextClinicId = data.clinicId ?? null;
        const nextDoctorId = data.doctorId ?? null;

        setClinicId(nextClinicId);
        setDoctorId(nextDoctorId);

        if (!nextClinicId || !nextDoctorId) {
          if (latestClinicRef.current) {
            clearClinicCache(latestClinicRef.current);
          }
          latestClinicRef.current = null;
          setDoctor(null);
          setQueue(null);
          setClinicName(null);
          setClinicShareCode(null);
          setNotificationSettings(undefined);
          return;
        }

        if (latestClinicRef.current !== nextClinicId) {
          if (latestClinicRef.current) {
            clearClinicCache(latestClinicRef.current);
          }
          latestClinicRef.current = nextClinicId;
          if (shareCodeRetryRef.current) {
            clearTimeout(shareCodeRetryRef.current);
            shareCodeRetryRef.current = null;
          }
          setNotificationSettings(undefined);
          setClinicShareCode(null);
          void loadNotificationSettings(nextClinicId);
          void loadClinicShareCode(nextClinicId);
        }

        unsubscribeClinic = detach(unsubscribeClinic);
        const clinicRef = doc(db, 'clinics', nextClinicId);
        unsubscribeClinic = onSnapshot(clinicRef, (clinicSnap) => {
          const cacheKey = ['clinicShareCodes', nextClinicId];
          if (!clinicSnap.exists()) {
            setClinicName(null);
            setClinicShareCode(null);
            setCachedValue(cacheKey, null);
            return;
          }
          const clinicData = (clinicSnap.data() as ClinicRecord | undefined) ?? {};
          setClinicName(clinicData.name ?? null);
          const shareCodeValue = (clinicData as { shareCode?: unknown }).shareCode;
          const shareCodeRaw = typeof shareCodeValue === 'string' ? shareCodeValue.trim() : '';
          if (shareCodeRaw) {
            const normalized = shareCodeRaw.toUpperCase();
            if (shareCodeRetryRef.current) {
              clearTimeout(shareCodeRetryRef.current);
              shareCodeRetryRef.current = null;
            }
            setClinicShareCode((prev) => (prev === normalized ? prev : normalized));
            setCachedValue(cacheKey, normalized);
          }
        });

        unsubscribeDoctor = detach(unsubscribeDoctor);
        const doctorRef = doc(db, 'clinics', nextClinicId, 'doctors', nextDoctorId);
        unsubscribeDoctor = onSnapshot(doctorRef, (doctorSnap) => {
          if (!doctorSnap.exists()) {
            setDoctor(null);
            return;
          }
          const doctorData = (doctorSnap.data() as DoctorRecord | undefined) ?? {};
          setDoctor({
            id: doctorSnap.id,
            name: doctorData.name ?? '',
            specialty: doctorData.specialty ?? null,
            clinicId: doctorData.clinicId ?? nextClinicId,
            email: doctorData.email ?? null,
            phone: doctorData.phone ?? null,
            createdAt: doctorData.createdAt ?? null,
          });
        });

        attachQueueListener(nextClinicId, nextDoctorId, todayKey);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeDoctor = detach(unsubscribeDoctor);
      unsubscribeQueue = detach(unsubscribeQueue);
      unsubscribeClinic = detach(unsubscribeClinic);
      unsubscribeUserDoc = detach(unsubscribeUserDoc);
      if (shareCodeRetryRef.current) {
        clearTimeout(shareCodeRetryRef.current);
        shareCodeRetryRef.current = null;
      }
    };
  }, [loadNotificationSettings, loadClinicShareCode, todayKey]);

  useEffect(() => {
    latestShareCodeRef.current = clinicShareCode;
  }, [clinicShareCode]);

  const contextValue = useMemo(
    () => ({
      clinicId,
      clinicShareCode,
      clinicName,
      doctorId,
      doctorName: doctor?.name ?? null,
      doctorSpecialty: doctor?.specialty ?? null,
      queueStatus: queue?.status,
      queue,
      notificationSettings,
      reloadNotificationSettings: refreshNotificationSettings,
    }),
    [clinicId, clinicShareCode, clinicName, doctor?.name, doctor?.specialty, doctorId, queue, notificationSettings, refreshNotificationSettings]
  );

  return <ClinicContext.Provider value={contextValue}>{children}</ClinicContext.Provider>;
}
