"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueAmbiguityReview = void 0;
const firebaseAdmin_1 = require("../firebaseAdmin");
const constants_1 = require("./constants");
const id_1 = require("./id");
const addDays = (source, days) => {
    const clone = new Date(source.getTime());
    clone.setUTCDate(clone.getUTCDate() + days);
    return clone;
};
const enqueueAmbiguityReview = async (options) => {
    const now = new Date();
    const createdAt = firebaseAdmin_1.admin.firestore.Timestamp.fromDate(now);
    const expiresAt = firebaseAdmin_1.admin.firestore.Timestamp.fromDate(addDays(now, constants_1.AMBIGUITY_ACTIVE_TTL_DAYS));
    const archiveAt = firebaseAdmin_1.admin.firestore.Timestamp.fromDate(addDays(now, constants_1.AMBIGUITY_NEARLINE_TTL_DAYS));
    const deepArchiveAt = firebaseAdmin_1.admin.firestore.Timestamp.fromDate(addDays(now, constants_1.AMBIGUITY_DEEP_ARCHIVE_AFTER_DAYS));
    const ambiguityId = (0, id_1.generatePatientId)();
    const db = firebaseAdmin_1.admin.firestore();
    const ref = db.collection(constants_1.PATIENT_AMBIGUITY_COLLECTION).doc(ambiguityId);
    const record = {
        ambiguityId,
        clinicId: options.clinicId,
        resolverVersion: constants_1.PATIENT_RESOLVER_VERSION,
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
    return ref;
};
exports.enqueueAmbiguityReview = enqueueAmbiguityReview;
//# sourceMappingURL=ambiguityQueue.js.map