import type { DocumentReference, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
    METADATA_OPTIONAL_FIELDS,
    PATIENT_CORE_SCHEMA_VERSION,
    PATIENT_METADATA_SCHEMA_VERSION,
    PATIENT_RESOLVER_VERSION
} from './constants';

export type FirestoreTimestamp = Timestamp;

export type PatientCoreStatus = 'active' | 'soft-deleted';
export type PatientResolverMatchType = 'existing' | 'created' | 'ambiguous' | 'phone-missing';
export type PatientResolverConfidence = 'high' | 'medium' | 'low' | 'none';
export type PatientAmbiguityStatus = 'pending' | 'archived' | 'resolved';
export type PatientResolverRolloutStage = 'off' | 'dry-run' | 'pilot' | 'on';

export interface PatientPhoneHash {
  hash: string;
  version: string;
  lastFour?: string | null;
  countryCode?: string | null;
  createdAt?: FirestoreTimestamp | FieldValue | null;
  updatedAt?: FirestoreTimestamp | FieldValue | null;
}

export type PatientOptionalField = (typeof METADATA_OPTIONAL_FIELDS)[number];

export interface PatientMetadata {
  schemaVersion: number;
  gender?: string | null;
  dob?: string | null;
  age?: number | null;
  address?: string | null;
  alternatePhoneHash?: PatientPhoneHash | null;
  guardianName?: string | null;
  bloodGroup?: string | null;
  allergies?: string[] | null;
  chronicConditions?: string[] | null;
  preferredLanguage?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

export interface PatientMetadataInput extends Partial<Omit<PatientMetadata, 'schemaVersion' | 'metadata'>> {
  metadata?: Record<string, unknown> | null;
}

export interface PatientCoreDocument {
  patientId: string;
  displayName: string;
  normalizedFullName: string;
  primaryClinicId: string;
  clinicIds: string[];
  phoneHashes: PatientPhoneHash[];
  primaryPhoneHash?: PatientPhoneHash | null;
  demographics?: {
    age?: number | null;
    dob?: string | null;
    gender?: string | null;
  } | null;
  metadata: PatientMetadata;
  metadataVersion: number;
  schemaVersion: number;
  createdAt: FirestoreTimestamp | FieldValue;
  updatedAt: FirestoreTimestamp | FieldValue;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdVia: 'queue' | 'manual' | 'migration' | 'admin';
  status: PatientCoreStatus;
  softDelete?: {
    deletedAt: FirestoreTimestamp | FieldValue;
    deletedBy?: string | null;
    reason?: string | null;
  } | null;
  auditVersion: number;
}

export interface PatientAmbiguityCandidate {
  patientId: string;
  reason: string;
  matchType: PatientResolverMatchType;
  confidence: PatientResolverConfidence;
}

export interface PatientAmbiguityRecord {
  ambiguityId: string;
  clinicId: string;
  resolverVersion: string;
  patientInput: {
    name: string;
    normalizedName: string;
    phoneHash?: PatientPhoneHash | null;
    metadata: PatientMetadata;
  };
  candidates: PatientAmbiguityCandidate[];
  status: PatientAmbiguityStatus;
  createdAt: FirestoreTimestamp;
  expiresAt: FirestoreTimestamp;
  archiveAt: FirestoreTimestamp;
  deepArchiveAt: FirestoreTimestamp;
  createdBy?: string | null;
  requiresReview: boolean;
  notes?: string | null;
}

export interface PatientResolverActor {
  actorType: 'system' | 'user' | 'patient';
  actorId?: string | null;
  actorClinicId?: string | null;
}

export interface PatientResolverPatientInput {
  name: string;
  normalizedName: string;
  age?: number | null;
  phone?: {
    normalized: string;
    countryCode?: string | null;
  } | null;
  metadata?: PatientMetadataInput | null;
}

export interface PatientResolverContext {
  clinicId: string;
  doctorId?: string | null;
  queueId?: string | null;
  queueDate?: string | null;
}

export interface PatientResolverRequest {
  actor: PatientResolverActor;
  context: PatientResolverContext;
  patient: PatientResolverPatientInput;
  allowCreate: boolean;
}

export interface PatientResolverResult {
  patientId: string;
  resolverVersion: string;
  matchType: PatientResolverMatchType;
  confidence: PatientResolverConfidence;
  requiresReview: boolean;
  patientDocRef: DocumentReference<PatientCoreDocument>;
  phoneHash?: PatientPhoneHash | null;
  ambiguityEntryRef?: DocumentReference<PatientAmbiguityRecord> | null;
  createdNewPatient: boolean;
  metadataVersion: number;
}

export interface QueuePatientLink {
  patientId: string;
  resolverVersion: string;
  matchType: PatientResolverMatchType;
  confidence: PatientResolverConfidence;
  requiresReview: boolean;
  metadataVersion: number;
  ambiguityId?: string | null;
  linkedAt: FieldValue | FirestoreTimestamp;
}

export const defaultPatientMetadata = (): PatientMetadata => ({
  schemaVersion: PATIENT_METADATA_SCHEMA_VERSION,
  metadata: {}
});

export const PATIENT_CORE_DEFAULTS: Pick<PatientCoreDocument, 'schemaVersion' | 'metadataVersion' | 'auditVersion' | 'status'> = {
  schemaVersion: PATIENT_CORE_SCHEMA_VERSION,
  metadataVersion: PATIENT_METADATA_SCHEMA_VERSION,
  auditVersion: 1,
  status: 'active'
};

export const PATIENT_RESOLVER_IDENTIFIER = PATIENT_RESOLVER_VERSION;

export interface PatientResolverFlagSnapshot {
  enabled: boolean;
  rolloutStage: PatientResolverRolloutStage;
  source: 'env' | 'firestore' | 'default' | 'error';
  updatedAt?: string | null;
}
