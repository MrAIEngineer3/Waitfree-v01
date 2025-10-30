import type { DocumentReference } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import {
    AMBIGUITY_ACTIVE_TTL_DAYS,
    AMBIGUITY_DEEP_ARCHIVE_AFTER_DAYS,
    AMBIGUITY_NEARLINE_TTL_DAYS,
    PATIENT_AMBIGUITY_COLLECTION,
    PATIENT_RESOLVER_VERSION
} from './constants';
import { generatePatientId } from './id';
import type {
    PatientAmbiguityCandidate,
    PatientAmbiguityRecord,
    PatientMetadata,
    PatientPhoneHash,
    PatientResolverActor
} from './types';

const addDays = (source: Date, days: number): Date => {
  const clone = new Date(source.getTime());
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
};

export interface EnqueueAmbiguityOptions {
  clinicId: string;
  actor: PatientResolverActor;
  patientName: string;
  normalizedName: string;
  phoneHash?: PatientPhoneHash | null;
  metadata: PatientMetadata;
  candidates: PatientAmbiguityCandidate[];
  reason?: string;
}

export const enqueueAmbiguityReview = async (
  options: EnqueueAmbiguityOptions
): Promise<DocumentReference<PatientAmbiguityRecord>> => {
  const now = new Date();
  const createdAt = admin.firestore.Timestamp.fromDate(now);
  const expiresAt = admin.firestore.Timestamp.fromDate(addDays(now, AMBIGUITY_ACTIVE_TTL_DAYS));
  const archiveAt = admin.firestore.Timestamp.fromDate(addDays(now, AMBIGUITY_NEARLINE_TTL_DAYS));
  const deepArchiveAt = admin.firestore.Timestamp.fromDate(addDays(now, AMBIGUITY_DEEP_ARCHIVE_AFTER_DAYS));

  const ambiguityId = generatePatientId();
  const db = admin.firestore();
  const ref = db.collection(PATIENT_AMBIGUITY_COLLECTION).doc(ambiguityId);

  const record: PatientAmbiguityRecord = {
    ambiguityId,
    clinicId: options.clinicId,
    resolverVersion: PATIENT_RESOLVER_VERSION,
    patientInput: {
      name: options.patientName,
      normalizedName: options.normalizedName,
      phoneHash: options.phoneHash ?? null,
      metadata: options.metadata
    },
    candidates: options.candidates,
    status: 'pending',
    createdAt,
    expiresAt,
    archiveAt,
    deepArchiveAt,
    createdBy: options.actor.actorId ?? null,
    requiresReview: true,
    notes: options.reason ?? null
  };

  await ref.set(record);
  return ref as DocumentReference<PatientAmbiguityRecord>;
};
