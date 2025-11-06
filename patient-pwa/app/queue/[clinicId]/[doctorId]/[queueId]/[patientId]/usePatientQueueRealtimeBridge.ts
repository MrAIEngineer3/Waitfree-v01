'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    doc,
    onSnapshot,
    type DocumentData,
    type DocumentSnapshot
} from 'firebase/firestore';
import { useEffect } from 'react';
import { db } from '../../../../../../lib/firebase';

type PatientStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled';

type QueueStatus = 'active' | 'paused' | 'ended';

type FirestoreTimestamp = Date | { seconds: number; nanoseconds: number } | null | undefined;

export interface Patient {
  id: string;
  name: string;
  age: number;
  phone: string;
  tokenNumber: number;
  status: PatientStatus;
  joinedAt: FirestoreTimestamp;
  queueId: string;
  clinicId: string;
  doctorId: string;
}

export interface Queue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: QueueStatus;
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinicId: string;
  email?: string;
  phone?: string;
}

interface UsePatientQueueBridgeOptions {
  enabled: boolean;
  clinicId?: string;
  doctorId?: string;
  queueId?: string;
  patientId?: string;
  patientFallback?: Patient | null;
  queryKeys: {
    patient: readonly unknown[];
    queue: readonly unknown[];
    doctor: readonly unknown[];
  };
  onRealtimeError?: (value: string | null) => void;
}

export function usePatientQueueRealtimeBridge({
  enabled,
  clinicId,
  doctorId,
  queueId,
  patientId,
  patientFallback,
  queryKeys,
  onRealtimeError,
}: UsePatientQueueBridgeOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !clinicId || !doctorId || !queueId || !patientId) {
      return;
    }

    let cancelled = false;
    const reportError = onRealtimeError ?? (() => {});

    reportError(null);

    const patientRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId, 'patients', patientId);
    const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', queueId);
    const doctorRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);

    const unsubscribePatient = onSnapshot(
      patientRef,
      (snapshot) => {
        if (cancelled) {
          return;
        }

        if (!snapshot.exists()) {
          reportError('Patient document not found');
          return;
        }

        reportError(null);
        queryClient.setQueryData<Patient | undefined>(queryKeys.patient, (prev) => {
          const existing: Patient | null = prev ?? patientFallback ?? null;
          const fallbackPatient: Patient = existing ?? {
            id: snapshot.id,
            name: '',
            age: 0,
            phone: '',
            tokenNumber: 0,
            status: 'waiting',
            joinedAt: null,
            queueId: typeof queueId === 'string' ? queueId : '',
            clinicId: typeof clinicId === 'string' ? clinicId : '',
            doctorId: typeof doctorId === 'string' ? doctorId : '',
          };

          return buildPatientFromSnapshot(snapshot, fallbackPatient);
        });
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Patient realtime listener error:', error);
        }
      }
    );

    const unsubscribeQueue = onSnapshot(
      queueRef,
      (snapshot) => {
        if (cancelled) {
          return;
        }

        if (!snapshot.exists()) {
          reportError('Queue document not found');
          return;
        }

        reportError(null);
        queryClient.setQueryData<Queue | undefined>(queryKeys.queue, () =>
          buildQueueFromSnapshot(snapshot, { clinicId, doctorId })
        );
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching queue:', error);
        }
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Error fetching queue data';
          reportError(message);
        }
      }
    );

    const unsubscribeDoctor = onSnapshot(
      doctorRef,
      (snapshot) => {
        if (cancelled) {
          return;
        }

        if (!snapshot.exists()) {
          reportError('Doctor document not found');
          return;
        }

        reportError(null);
        queryClient.setQueryData<Doctor | undefined>(queryKeys.doctor, () =>
          buildDoctorFromSnapshot(snapshot, { clinicId })
        );
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching doctor:', error);
        }
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Error fetching doctor data';
          reportError(message);
        }
      }
    );

    return () => {
      cancelled = true;
      try { unsubscribeQueue(); } catch {}
      try { unsubscribeDoctor(); } catch {}
      try { unsubscribePatient(); } catch {}
    };
  }, [
    enabled,
    clinicId,
    doctorId,
    queueId,
    patientId,
    patientFallback,
    queryClient,
    queryKeys.patient,
    queryKeys.queue,
    queryKeys.doctor,
    onRealtimeError,
  ]);
}

export function buildPatientFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  fallback: Patient
): Patient {
  const raw = snapshot.data() as DocumentData;
  return {
    id: snapshot.id,
    name: typeof raw.name === 'string' ? raw.name : fallback.name,
    age: typeof raw.age === 'number' ? raw.age : fallback.age,
    phone: typeof raw.phone === 'string' ? raw.phone : fallback.phone,
    tokenNumber: typeof raw.tokenNumber === 'number' ? raw.tokenNumber : fallback.tokenNumber,
    status: (raw.status as PatientStatus) ?? fallback.status,
    joinedAt: (raw.joinedAt as FirestoreTimestamp) ?? fallback.joinedAt,
    queueId: typeof raw.queueId === 'string' ? raw.queueId : fallback.queueId,
    clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : fallback.clinicId,
    doctorId: typeof raw.doctorId === 'string' ? raw.doctorId : fallback.doctorId,
  };
}

export function buildQueueFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  defaults: { clinicId: string; doctorId: string }
): Queue {
  const raw = snapshot.data() as DocumentData;
  return {
    id: snapshot.id,
    doctorId: typeof raw.doctorId === 'string' ? raw.doctorId : defaults.doctorId,
    clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : defaults.clinicId,
    status: (raw.status as QueueStatus) ?? 'active',
    currentToken: typeof raw.currentToken === 'number' ? raw.currentToken : 0,
    totalPatients: typeof raw.totalPatients === 'number' ? raw.totalPatients : 0,
    completedPatients: typeof raw.completedPatients === 'number' ? raw.completedPatients : 0,
    createdAt: (raw.createdAt as FirestoreTimestamp) ?? undefined,
    updatedAt: (raw.updatedAt as FirestoreTimestamp) ?? undefined,
  };
}

export function buildDoctorFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  defaults: { clinicId: string }
): Doctor {
  const raw = snapshot.data() as DocumentData;
  return {
    id: snapshot.id,
    name: typeof raw.name === 'string' ? raw.name : 'Doctor',
    specialty: typeof raw.specialty === 'string' ? raw.specialty : 'General Practice',
    clinicId: typeof raw.clinicId === 'string' ? raw.clinicId : defaults.clinicId,
    email: typeof raw.email === 'string' ? raw.email : undefined,
    phone: typeof raw.phone === 'string' ? raw.phone : undefined,
  };
}
