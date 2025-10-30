"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildQueuePatientLink = exports.resolvePatientForQueue = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firebaseAdmin_1 = require("../firebaseAdmin");
const ambiguityQueue_1 = require("./ambiguityQueue");
const audit_1 = require("./audit");
const constants_1 = require("./constants");
const id_1 = require("./id");
const metadata_1 = require("./metadata");
const phoneHash_1 = require("./phoneHash");
const types_1 = require("./types");
const buildDemographics = (metadata) => {
    return {
        age: metadata.age ?? null,
        dob: metadata.dob ?? null,
        gender: metadata.gender ?? null
    };
};
const resolvePatientForQueue = async (request) => {
    const { clinicId } = request.context;
    const patientName = request.patient.name;
    const normalizedName = request.patient.normalizedName;
    const baseMetadata = request.patient.metadata ? { ...request.patient.metadata } : {};
    const metadata = (0, metadata_1.normalizePatientMetadata)({
        ...baseMetadata,
        age: request.patient.age ?? request.patient.metadata?.age ?? null
    });
    const phone = request.patient.phone?.normalized ?? null;
    const db = firebaseAdmin_1.admin.firestore();
    let phoneHash = null;
    if (phone) {
        phoneHash = (0, phoneHash_1.computePatientPhoneHash)(phone);
    }
    const serverTimestamp = firestore_1.FieldValue.serverTimestamp();
    const nowTimestamp = firestore_1.Timestamp.now();
    const outcome = await db.runTransaction(async (transaction) => {
        // Attempt to find existing patient via phone hash lookup when available.
        if (phoneHash) {
            const lookupRef = (0, phoneHash_1.getPhoneLookupRef)(clinicId, phoneHash);
            const lookupSnap = await transaction.get(lookupRef);
            if (lookupSnap.exists) {
                const lookupData = lookupSnap.data();
                const patientId = typeof lookupData.patientId === 'string' ? lookupData.patientId : null;
                if (patientId) {
                    const existingPatientRef = db
                        .collection(constants_1.PATIENTS_COLLECTION)
                        .doc(patientId);
                    const patientSnap = await transaction.get(existingPatientRef);
                    if (patientSnap.exists) {
                        transaction.update(existingPatientRef, {
                            updatedAt: serverTimestamp,
                            updatedBy: request.actor.actorId ?? null,
                            clinicIds: firestore_1.FieldValue.arrayUnion(clinicId)
                        });
                        transaction.set(lookupRef, {
                            patientId,
                            clinicId,
                            phoneHash,
                            lastSeenAt: serverTimestamp,
                            resolverVersion: constants_1.PATIENT_RESOLVER_VERSION
                        }, { merge: true });
                        return {
                            result: {
                                patientId,
                                resolverVersion: constants_1.PATIENT_RESOLVER_VERSION,
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
                        };
                    }
                    // Lookup exists but patient doc missing -> create watcher entry but flag for review.
                    const recreatedPatientRef = db
                        .collection(constants_1.PATIENTS_COLLECTION)
                        .doc(patientId);
                    const patientDoc = {
                        ...types_1.PATIENT_CORE_DEFAULTS,
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
                    transaction.set(lookupRef, {
                        patientId,
                        clinicId,
                        phoneHash,
                        lastSeenAt: serverTimestamp,
                        resolverVersion: constants_1.PATIENT_RESOLVER_VERSION
                    }, { merge: true });
                    return {
                        result: {
                            patientId,
                            resolverVersion: constants_1.PATIENT_RESOLVER_VERSION,
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
                    };
                }
            }
        }
        if (!request.allowCreate) {
            throw new Error('Patient resolver denied creation due to allowCreate=false');
        }
        const patientId = (0, id_1.generatePatientId)();
        const newPatientRef = db
            .collection(constants_1.PATIENTS_COLLECTION)
            .doc(patientId);
        const phoneHashes = phoneHash
            ? [
                {
                    ...phoneHash,
                    createdAt: nowTimestamp,
                    updatedAt: nowTimestamp
                }
            ]
            : [];
        const patientDoc = {
            ...types_1.PATIENT_CORE_DEFAULTS,
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
            const lookupRef = (0, phoneHash_1.getPhoneLookupRef)(clinicId, phoneHash);
            transaction.set(lookupRef, {
                patientId,
                clinicId,
                phoneHash,
                createdAt: serverTimestamp,
                lastSeenAt: serverTimestamp,
                resolverVersion: constants_1.PATIENT_RESOLVER_VERSION
            });
        }
        return {
            result: {
                patientId,
                resolverVersion: constants_1.PATIENT_RESOLVER_VERSION,
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
        };
    });
    let ambiguityRef = outcome.result.ambiguityEntryRef ?? null;
    if (outcome.result.requiresReview && outcome.ambiguityCandidates) {
        const ambiguityRecord = await (0, ambiguityQueue_1.enqueueAmbiguityReview)({
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
    await (0, audit_1.writePatientAuditEvent)({
        patientId: outcome.result.patientId,
        clinicId,
        doctorId: request.context.doctorId ?? null,
        eventType: outcome.result.createdNewPatient ? 'patient-created' : 'patient-linked',
        actor: request.actor,
        details: {
            matchType: outcome.result.matchType,
            confidence: outcome.result.confidence,
            requiresReview: outcome.result.requiresReview,
            resolverVersion: types_1.PATIENT_RESOLVER_IDENTIFIER
        }
    });
    return {
        ...outcome.result,
        ambiguityEntryRef: ambiguityRef
    };
};
exports.resolvePatientForQueue = resolvePatientForQueue;
const buildQueuePatientLink = (result) => {
    return {
        patientId: result.patientId,
        resolverVersion: result.resolverVersion,
        matchType: result.matchType,
        confidence: result.confidence,
        requiresReview: result.requiresReview,
        metadataVersion: result.metadataVersion,
        ambiguityId: result.ambiguityEntryRef ? result.ambiguityEntryRef.id : null,
        linkedAt: firestore_1.FieldValue.serverTimestamp()
    };
};
exports.buildQueuePatientLink = buildQueuePatientLink;
//# sourceMappingURL=resolver.js.map