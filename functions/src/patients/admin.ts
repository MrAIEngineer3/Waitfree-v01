import type { Query, Timestamp } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import { PATIENT_AMBIGUITY_COLLECTION } from './constants';
import type { PatientAmbiguityRecord } from './types';

export interface ListAmbiguitiesOptions {
  clinicId?: string | null;
  status?: 'pending' | 'archived';
  limit?: number;
}

export interface PatientAmbiguitySummary {
  ambiguityId: string;
  clinicId: string;
  status: string;
  resolverVersion: string;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
  archiveAt: Timestamp | null;
  deepArchiveAt: Timestamp | null;
  requiresReview: boolean;
  candidateCount: number;
}

export const listPatientAmbiguities = async (
  options: ListAmbiguitiesOptions = {}
): Promise<PatientAmbiguitySummary[]> => {
  const db = admin.firestore();
  let query: Query<PatientAmbiguityRecord> = db
    .collection(PATIENT_AMBIGUITY_COLLECTION)
    .limit(options.limit && options.limit > 0 ? options.limit : 25) as Query<PatientAmbiguityRecord>;

  if (options.clinicId) {
    query = query.where('clinicId', '==', options.clinicId) as Query<PatientAmbiguityRecord>;
  }

  if (options.status) {
    query = query.where('status', '==', options.status) as Query<PatientAmbiguityRecord>;
  } else {
    query = query.where('status', '==', 'pending') as Query<PatientAmbiguityRecord>;
  }

  query = query.orderBy('createdAt', 'desc');

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ambiguityId: data.ambiguityId,
      clinicId: data.clinicId,
      status: data.status,
      resolverVersion: data.resolverVersion,
      createdAt: data.createdAt ?? null,
      expiresAt: data.expiresAt ?? null,
      archiveAt: data.archiveAt ?? null,
      deepArchiveAt: data.deepArchiveAt ?? null,
      requiresReview: data.requiresReview,
      candidateCount: Array.isArray(data.candidates) ? data.candidates.length : 0
    } satisfies PatientAmbiguitySummary;
  });
};
