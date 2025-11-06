import { useQueryClient } from '@tanstack/react-query';
import {
    collection,
    doc,
    onSnapshot,
    query,
    type DocumentData,
    type DocumentSnapshot,
    type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { db } from '../firebase';

const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export type FirestoreTimestamp = Date | { seconds: number; nanoseconds: number } | null | undefined;

export type QueuePatientStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled';

export type QueueStatus = 'active' | 'paused' | 'ended' | 'closed';

export interface DashboardQueuePatient {
  id: string;
  tokenNumber: number;
  name: string;
  age: number;
  phone: string;
  status: QueuePatientStatus;
  joinedAt: FirestoreTimestamp;
  queueId: string;
}

export interface DashboardQueue {
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

export interface RealtimeSnapshotMeta {
  size: number;
  latencyMs: number;
}

interface UseDashboardQueueRealtimeBridgeOptions {
  enabled: boolean;
  clinicId?: string | null;
  doctorId?: string | null;
  queueId?: string;
  queryKey: readonly unknown[];
  onError?: (message: string | null) => void;
}

interface UseDashboardQueueDocRealtimeBridgeOptions {
  enabled: boolean;
  clinicId?: string | null;
  doctorId?: string | null;
  queueId?: string;
  queryKey: readonly unknown[];
  onError?: (message: string | null) => void;
  onSnapshotMeta?: (meta: RealtimeSnapshotMeta) => void;
}

export function useDashboardQueueRealtimeBridge({
  enabled,
  clinicId,
  doctorId,
  queueId,
  queryKey,
  onError,
}: UseDashboardQueueRealtimeBridgeOptions) {
  const queryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!enabled || !clinicId || !doctorId || !queueId) {
      setIsHydrated(false);
      onError?.(null);
      return;
    }

    const patientsRef = collection(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId, 'patients');
    const snapshotQuery = query(patientsRef);

    const unsubscribe = onSnapshot(
      snapshotQuery,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => buildDashboardPatientFromSnapshot(docSnap, { queueId }));

        queryClient.setQueryData<DashboardQueuePatient[]>(queryKey, next);
        setIsHydrated(true);
        onError?.(null);
      },
      (error) => {
        console.error('[DashboardQueueBridge] Failed to subscribe to patients', error);
        onError?.(error instanceof Error ? error.message : 'Failed to load patients');
      }
    );

    return () => {
      unsubscribe();
      setIsHydrated(false);
    };
  }, [enabled, clinicId, doctorId, queueId, queryClient, queryKey, onError]);

  return { isHydrated };
}

export function useDashboardQueueDocRealtimeBridge({
  enabled,
  clinicId,
  doctorId,
  queueId,
  queryKey,
  onError,
  onSnapshotMeta,
}: UseDashboardQueueDocRealtimeBridgeOptions) {
  const queryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);
  const [lastSnapshotMeta, setLastSnapshotMeta] = useState<RealtimeSnapshotMeta | null>(null);
  const previousSnapshotTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !clinicId || !doctorId || !queueId) {
      setIsHydrated(false);
      setLastSnapshotMeta(null);
      previousSnapshotTsRef.current = null;
      onError?.(null);
      queryClient.setQueryData<DashboardQueue | null>(queryKey, null);
      return;
    }

    const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId);
    const subscriptionStart = getNow();
    previousSnapshotTsRef.current = null;

    const unsubscribe = onSnapshot(
      queueRef,
      (snapshot) => {
        const nextQueue = snapshot.exists()
          ? buildDashboardQueueFromSnapshot(snapshot, { clinicId, doctorId, queueId })
          : null;

        queryClient.setQueryData<DashboardQueue | null>(queryKey, nextQueue);
        setIsHydrated(true);
        onError?.(null);

        const now = getNow();
        const previous = previousSnapshotTsRef.current;
        const latencyMs = previous != null ? now - previous : now - subscriptionStart;
        const meta: RealtimeSnapshotMeta = {
          size: snapshot.exists() ? 1 : 0,
          latencyMs,
        };
        previousSnapshotTsRef.current = now;
        setLastSnapshotMeta(meta);
        onSnapshotMeta?.(meta);
      },
      (error) => {
        console.error('[DashboardQueueBridge] Failed to subscribe to queue doc', error);
        onError?.(error instanceof Error ? error.message : 'Failed to load queue');
      }
    );

    return () => {
      unsubscribe();
      setIsHydrated(false);
      setLastSnapshotMeta(null);
      previousSnapshotTsRef.current = null;
    };
  }, [enabled, clinicId, doctorId, queueId, queryClient, queryKey, onError, onSnapshotMeta]);

  return { isHydrated, lastSnapshotMeta };
}

export function buildDashboardPatientFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  fallback: { queueId: string }
): DashboardQueuePatient {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    tokenNumber: typeof data.tokenNumber === 'number' ? data.tokenNumber : 0,
    name: typeof data.name === 'string' ? data.name : 'Unknown',
    age: typeof data.age === 'number' ? data.age : 0,
    phone: typeof data.phone === 'string' ? data.phone : '',
    status: (data.status as QueuePatientStatus) ?? 'waiting',
    joinedAt: (data.joinedAt as FirestoreTimestamp) ?? null,
    queueId: typeof data.queueId === 'string' ? data.queueId : fallback.queueId,
  };
}

export function buildDashboardQueueFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  fallback: { clinicId: string; doctorId: string; queueId: string }
): DashboardQueue {
  const data = (snapshot.data() as Record<string, unknown> | undefined) ?? {};

  return {
    id: snapshot.id,
    doctorId: typeof data.doctorId === 'string' ? (data.doctorId as string) : fallback.doctorId,
    clinicId: typeof data.clinicId === 'string' ? (data.clinicId as string) : fallback.clinicId,
    status: (data.status as QueueStatus) ?? 'active',
    currentToken: typeof data.currentToken === 'number' ? data.currentToken : 0,
    totalPatients: typeof data.totalPatients === 'number' ? data.totalPatients : 0,
    completedPatients: typeof data.completedPatients === 'number' ? data.completedPatients : 0,
    createdAt: (data.createdAt as FirestoreTimestamp) ?? null,
    updatedAt: (data.updatedAt as FirestoreTimestamp) ?? null,
    autoAdvance: typeof data.autoAdvance === 'boolean' ? (data.autoAdvance as boolean) : false,
  };
}
