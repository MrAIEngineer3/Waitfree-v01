"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writePatientAuditEvent = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firebaseAdmin_1 = require("../firebaseAdmin");
const constants_1 = require("./constants");
const writePatientAuditEvent = async (event) => {
    const db = firebaseAdmin_1.admin.firestore();
    await db.collection(constants_1.PATIENT_AUDIT_COLLECTION).add({
        patientId: event.patientId,
        clinicId: event.clinicId ?? null,
        doctorId: event.doctorId ?? null,
        eventType: event.eventType,
        actor: event.actor,
        resolverVersion: constants_1.PATIENT_RESOLVER_VERSION,
        details: event.details ?? {},
        createdAt: firestore_1.FieldValue.serverTimestamp()
    });
};
exports.writePatientAuditEvent = writePatientAuditEvent;
//# sourceMappingURL=audit.js.map