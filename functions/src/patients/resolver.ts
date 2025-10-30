import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import { enqueueAmbiguityReview } from './ambiguityQueue';
import { writePatientAuditEvent } from './audit';
import {
    PATIENTS_COLLECTION,
    PATIENT_RESOLVER_VERSION
} from './constants';
import { generatePatientId } from './id';
import { normalizePatientMetadata } from './metadata';
import { computePatientPhoneHash, getPhoneLookupRef } from './phoneHash';
import type {
    PatientAmbiguityCandidate,
    PatientCoreDocument,
    PatientMetadata,
    PatientMetadataInput,
    PatientPhoneHash,
    PatientResolverRequest,
    PatientResolverResult,
    QueuePatientLink
} from './types';
import { PATIENT_CORE_DEFAULTS, PATIENT_RESOLVER_IDENTIFIER } from './types';

interface TransactionOutcome {
  result: PatientResolverResult;
  metadata: PatientMetadata;
  phoneHash?: PatientPhoneHash | null;
  ambiguityCandidates?: PatientAmbiguityCandidate[];
}

const buildDemographics = (metadata: PatientMetadata) => {
  return {
    age: metadata.age ?? null,
    dob: metadata.dob ?? null,
    gender: metadata.gender ?? null
  };
};

export const resolvePatientForQueue = async (request: PatientResolverRequest): Promise<PatientResolverResult> => {
  const { clinicId } = request.context;
  const patientName = request.patient.name;
  const normalizedName = request.patient.normalizedName;
  const baseMetadata: PatientMetadataInput = request.patient.metadata ? { ...request.patient.metadata } : {};
  const metadata = normalizePatientMetadata({
    ...baseMetadata,
    age: request.patient.age ?? request.patient.metadata?.age ?? null
  });

  const phone = request.patient.phone?.normalized ?? null;
  const db = admin.firestore();
  let phoneHash: PatientPhoneHash | null = null;
  if (phone) {
    phoneHash = computePatientPhoneHash(phone);
  }

  const serverTimestamp = FieldValue.serverTimestamp();
  const nowTimestamp = Timestamp.now();

  const outcome = await db.runTransaction<TransactionOutcome>(async (transaction) => {
    // Attempt to find existing patient via phone hash lookup when available.
    if (phoneHash) {
      const lookupRef = getPhoneLookupRef(clinicId, phoneHash);
      const lookupSnap = await transaction.get(lookupRef);
      if (lookupSnap.exists) {
        const lookupData = lookupSnap.data() as Record<string, unknown>;
        const patientId = typeof lookupData.patientId === 'string' ? lookupData.patientId : null;
        if (patientId) {
          const existingPatientRef = db
            .collection(PATIENTS_COLLECTION)
            .doc(patientId) as DocumentReference<PatientCoreDocument>;
          const patientSnap = await transaction.get(existingPatientRef);
          if (patientSnap.exists) {
            transaction.update(existingPatientRef, {
              updatedAt: serverTimestamp,
              updatedBy: request.actor.actorId ?? null,
              clinicIds: FieldValue.arrayUnion(clinicId)
            });
            transaction.set(
              lookupRef,
              {
                patientId,
                clinicId,
                phoneHash,
                lastSeenAt: serverTimestamp,
                resolverVersion: PATIENT_RESOLVER_VERSION
              },
              { merge: true }
            );

            return {
              result: {
                patientId,
                resolverVersion: PATIENT_RESOLVER_VERSION,
                matchType: 'existing',
                confidence: 'high',
                requiresReview: false,
                patientDocRef: existingPatientRef,
                phoneHash,
                ambiguityEntryRef: null,
                createdNewPatient: false,
                metadataVersion: metadata.schemaVersion
              },
              metadata,
              phoneHash
            } as TransactionOutcome;
          }

          // Lookup exists but patient doc missing -> create watcher entry but flag for review.
          const recreatedPatientRef = db
            .collection(PATIENTS_COLLECTION)
            .doc(patientId) as DocumentReference<PatientCoreDocument>;
          const patientDoc: PatientCoreDocument = {
            ...PATIENT_CORE_DEFAULTS,
            patientId,
            displayName: patientName,
            normalizedFullName: normalizedName,
            primaryClinicId: clinicId,
            clinicIds: [clinicId],
            phoneHashes: [
              {
                ...phoneHash,
                createdAt: nowTimestamp,
                updatedAt: nowTimestamp
              }
            ],
            primaryPhoneHash: phoneHash,
            demographics: buildDemographics(metadata),
            metadata,
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,
            createdBy: request.actor.actorId ?? null,
            updatedBy: request.actor.actorId ?? null,
            createdVia: 'queue'
          };

          transaction.set(recreatedPatientRef, patientDoc);
          transaction.set(
            lookupRef,
            {
              patientId,
              clinicId,
              phoneHash,
              lastSeenAt: serverTimestamp,
              resolverVersion: PATIENT_RESOLVER_VERSION
            },
            { merge: true }
          );

          return {
            result: {
              patientId,
              resolverVersion: PATIENT_RESOLVER_VERSION,
              matchType: 'ambiguous',
              confidence: 'medium',
              requiresReview: true,
              patientDocRef: recreatedPatientRef,
              phoneHash,
              ambiguityEntryRef: null,
              createdNewPatient: true,
              metadataVersion: metadata.schemaVersion
            },
            metadata,
            phoneHash,
            ambiguityCandidates: [
              {
                patientId,
                reason: 'lookup-doc-missing',
                matchType: 'existing',
                confidence: 'medium'
              }
            ]
          } as TransactionOutcome;
        }
      }
    }

    if (!request.allowCreate) {
      throw new Error('Patient resolver denied creation due to allowCreate=false');
    }

    const patientId = generatePatientId();
    const newPatientRef = db
      .collection(PATIENTS_COLLECTION)
      .doc(patientId) as DocumentReference<PatientCoreDocument>;

    const phoneHashes = phoneHash
      ? [
          {
            ...phoneHash,
            createdAt: nowTimestamp,
            updatedAt: nowTimestamp
          }
        ]
      : [];

    const patientDoc: PatientCoreDocument = {
      ...PATIENT_CORE_DEFAULTS,
      patientId,
      displayName: patientName,
      normalizedFullName: normalizedName,
      primaryClinicId: clinicId,
      clinicIds: [clinicId],
      phoneHashes,
      primaryPhoneHash: phoneHash ?? null,
      demographics: buildDemographics(metadata),
      metadata,
      createdAt: serverTimestamp,
      updatedAt: serverTimestamp,
      createdBy: request.actor.actorId ?? null,
      updatedBy: request.actor.actorId ?? null,
      createdVia: 'queue'
    };

    transaction.set(newPatientRef, patientDoc);

    if (phoneHash) {
      const lookupRef = getPhoneLookupRef(clinicId, phoneHash);
      transaction.set(lookupRef, {
        patientId,
        clinicId,
        phoneHash,
        createdAt: serverTimestamp,
        lastSeenAt: serverTimestamp,
        resolverVersion: PATIENT_RESOLVER_VERSION
      });
    }

    return {
      result: {
        patientId,
        resolverVersion: PATIENT_RESOLVER_VERSION,
        matchType: phoneHash ? 'created' : 'phone-missing',
        confidence: phoneHash ? 'medium' : 'none',
        requiresReview: !phoneHash,
        patientDocRef: newPatientRef,
        phoneHash,
        ambiguityEntryRef: null,
        createdNewPatient: true,
        metadataVersion: metadata.schemaVersion
      },
      metadata,
      phoneHash,
      ambiguityCandidates: phoneHash
        ? undefined
        : [
            {
              patientId,
              reason: 'no-phone',
              matchType: 'phone-missing',
              confidence: 'none'
            }
          ]
    } as TransactionOutcome;
  });

  let ambiguityRef = outcome.result.ambiguityEntryRef ?? null;
  if (outcome.result.requiresReview && outcome.ambiguityCandidates) {
    const ambiguityRecord = await enqueueAmbiguityReview({
      clinicId,
      actor: request.actor,
      patientName,
      normalizedName,
      phoneHash: outcome.phoneHash ?? null,
      metadata: outcome.metadata,
      candidates: outcome.ambiguityCandidates,
      reason: outcome.result.matchType === 'phone-missing' ? 'missing-phone' : 'resolver-ambiguity'
    });
    ambiguityRef = ambiguityRecord;
  }

  await writePatientAuditEvent({
    patientId: outcome.result.patientId,
    clinicId,
    doctorId: request.context.doctorId ?? null,
    eventType: outcome.result.createdNewPatient ? 'patient-created' : 'patient-linked',
    actor: request.actor,
    details: {
      matchType: outcome.result.matchType,
      confidence: outcome.result.confidence,
      requiresReview: outcome.result.requiresReview,
      resolverVersion: PATIENT_RESOLVER_IDENTIFIER
    }
  });

  return {
    ...outcome.result,
    ambiguityEntryRef: ambiguityRef
  } as PatientResolverResult;
};

export const buildQueuePatientLink = (result: PatientResolverResult): QueuePatientLink => {
  return {
    patientId: result.patientId,
    resolverVersion: result.resolverVersion,
    matchType: result.matchType,
    confidence: result.confidence,
    requiresReview: result.requiresReview,
    metadataVersion: result.metadataVersion,
    ambiguityId: result.ambiguityEntryRef ? result.ambiguityEntryRef.id : null,
    linkedAt: FieldValue.serverTimestamp()
  } satisfies QueuePatientLink;
};
