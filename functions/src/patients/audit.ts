import { FieldValue } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import { PATIENT_AUDIT_COLLECTION, PATIENT_RESOLVER_VERSION } from './constants';
import type { PatientResolverActor } from './types';

export interface PatientAuditEvent {
  patientId: string;
  clinicId?: string | null;
  doctorId?: string | null;
  eventType: 'patient-linked' | 'patient-created' | 'patient-ambiguity' | 'patient-soft-deleted' | 'patient-updated';
  actor: PatientResolverActor;
  details?: Record<string, unknown>;
}

export const writePatientAuditEvent = async (event: PatientAuditEvent): Promise<void> => {
  const db = admin.firestore();
  await db.collection(PATIENT_AUDIT_COLLECTION).add({
    patientId: event.patientId,
    clinicId: event.clinicId ?? null,
    doctorId: event.doctorId ?? null,
    eventType: event.eventType,
    actor: event.actor,
    resolverVersion: PATIENT_RESOLVER_VERSION,
    details: event.details ?? {},
    createdAt: FieldValue.serverTimestamp()
  });
};
