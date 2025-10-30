"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPatientAmbiguities = void 0;
const firebaseAdmin_1 = require("../firebaseAdmin");
const constants_1 = require("./constants");
const listPatientAmbiguities = async (options = {}) => {
    const db = firebaseAdmin_1.admin.firestore();
    let query = db
        .collection(constants_1.PATIENT_AMBIGUITY_COLLECTION)
        .limit(options.limit && options.limit > 0 ? options.limit : 25);
    if (options.clinicId) {
        query = query.where('clinicId', '==', options.clinicId);
    }
    if (options.status) {
        query = query.where('status', '==', options.status);
    }
    else {
        query = query.where('status', '==', 'pending');
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
        };
    });
};
exports.listPatientAmbiguities = listPatientAmbiguities;
//# sourceMappingURL=admin.js.map