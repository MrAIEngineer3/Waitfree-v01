"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDoctorScheduleOverride = exports.updateDoctorScheduleOverride = exports.createDoctorScheduleOverride = exports.updateDoctorDefaultRota = exports.setDoctorRealTimeStatus = exports.NotFoundError = exports.ValidationError = void 0;
const firestore_1 = require("firebase-admin/firestore");
const luxon_1 = require("luxon");
const firebaseAdmin_1 = require("../firebaseAdmin");
const utils_1 = require("./utils");
const db = firebaseAdmin_1.admin.firestore();
const MAX_NOTE_LENGTH = 280;
const sliceNote = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.slice(0, MAX_NOTE_LENGTH);
};
const sanitizeSource = (value) => {
    if (value === 'system' || value === 'automation') {
        return value;
    }
    return 'staff';
};
const doctorRef = (clinicId, doctorId) => db.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId);
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
const setDoctorRealTimeStatus = async (input) => {
    const { clinicId, doctorId, online } = input;
    if (!clinicId || !doctorId) {
        throw new ValidationError('clinicId and doctorId are required');
    }
    if (typeof online !== 'boolean') {
        throw new ValidationError('online must be a boolean');
    }
    const note = sliceNote(input.note);
    const source = sanitizeSource(input.source);
    const ref = doctorRef(clinicId, doctorId);
    const { previousStatus, changed } = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const docData = snap.data() || {};
        const scheduling = (docData.scheduling || {});
        const prev = scheduling.realTimeStatus ?? null;
        const newStatus = {
            online,
            note,
            source,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        };
        tx.set(ref, {
            scheduling: {
                realTimeStatus: newStatus
            }
        }, { merge: true });
        const changedFlag = prev ? prev.online !== online : true;
        return {
            previousStatus: prev,
            changed: changedFlag
        };
    });
    const latestSnap = await ref.get();
    const latestScheduling = (latestSnap.data()?.scheduling || {});
    const updatedStatus = latestScheduling.realTimeStatus ?? null;
    if (!updatedStatus) {
        throw new Error('Failed to read updated real-time status');
    }
    return { previousStatus, updatedStatus, changed, clinicId, doctorId };
};
exports.setDoctorRealTimeStatus = setDoctorRealTimeStatus;
const updateDoctorDefaultRota = async (input) => {
    const { clinicId, doctorId, timeZone } = input;
    if (!clinicId || !doctorId) {
        throw new ValidationError('clinicId and doctorId are required');
    }
    if (!(0, utils_1.ensureValidTimeZone)(timeZone)) {
        throw new ValidationError('timeZone must be a valid IANA zone');
    }
    const weekInput = (0, utils_1.filterValidDays)((input.week ?? {}));
    const normalized = (0, utils_1.normalizeWeekDefinition)(weekInput);
    if (!normalized) {
        throw new ValidationError('week definition is invalid or contains overlapping blocks');
    }
    const ref = doctorRef(clinicId, doctorId);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const existing = snap.data()?.scheduling?.defaultRota;
        const currentVersion = typeof existing?.version === 'number' ? existing.version : 0;
        const nextVersion = currentVersion + 1;
        const rota = {
            timeZone,
            week: normalized,
            version: nextVersion,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        };
        tx.set(ref, {
            scheduling: {
                defaultRota: rota
            }
        }, { merge: true });
        return rota;
    });
    return result;
};
exports.updateDoctorDefaultRota = updateDoctorDefaultRota;
const parseDateTime = (value, label) => {
    if (typeof value !== 'string') {
        throw new ValidationError(`${label} must be an ISO-8601 string`);
    }
    const dt = luxon_1.DateTime.fromISO(value, { setZone: true });
    if (!dt.isValid) {
        throw new ValidationError(`${label} must be a valid ISO-8601 date`);
    }
    return dt.toUTC();
};
const assertOverrideType = (value) => {
    if (value === 'blocker' || value === 'exception') {
        return value;
    }
    throw new ValidationError('type must be blocker or exception');
};
const overridesRef = (clinicId, doctorId) => doctorRef(clinicId, doctorId).collection('schedulingOverrides');
const sanitizeOverrideInput = (payload) => {
    const { clinicId, doctorId } = payload;
    if (!clinicId || !doctorId) {
        throw new ValidationError('clinicId and doctorId are required');
    }
    const type = assertOverrideType(payload.type);
    const start = parseDateTime(payload.start, 'start');
    const end = parseDateTime(payload.end, 'end');
    if (end <= start) {
        throw new ValidationError('end must be after start');
    }
    const note = sliceNote(payload.note);
    const base = {
        type,
        start: firestore_1.Timestamp.fromDate(start.toJSDate()),
        end: firestore_1.Timestamp.fromDate(end.toJSDate()),
        note: note ?? null
    };
    if (type === 'blocker') {
        const blockerPayload = payload;
        const reasonCode = typeof blockerPayload.reasonCode === 'string' ? blockerPayload.reasonCode.trim().slice(0, 80) : null;
        return { clinicId, doctorId, type, data: { ...base, reasonCode } };
    }
    const exceptionPayload = payload;
    const label = typeof exceptionPayload.label === 'string' ? exceptionPayload.label.trim().slice(0, 120) : null;
    return { clinicId, doctorId, type, data: { ...base, label } };
};
const createDoctorScheduleOverride = async (payload) => {
    const { clinicId, doctorId, data, type } = sanitizeOverrideInput(payload);
    const overrides = overridesRef(clinicId, doctorId);
    const docRef = payload.overrideId ? overrides.doc(payload.overrideId) : overrides.doc();
    await docRef.set({
        ...data,
        type,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    const saved = await docRef.get();
    if (!saved.exists) {
        throw new Error('Failed to read override after creation');
    }
    return { id: docRef.id, override: saved.data() };
};
exports.createDoctorScheduleOverride = createDoctorScheduleOverride;
const updateDoctorScheduleOverride = async (payload) => {
    if (!payload.overrideId) {
        throw new ValidationError('overrideId is required for update');
    }
    const { clinicId, doctorId, data, type } = sanitizeOverrideInput(payload);
    const docRef = overridesRef(clinicId, doctorId).doc(payload.overrideId);
    const existing = await docRef.get();
    if (!existing.exists) {
        throw new NotFoundError('override not found');
    }
    await docRef.update({
        ...data,
        type,
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    const saved = await docRef.get();
    return { id: docRef.id, override: saved.data() };
};
exports.updateDoctorScheduleOverride = updateDoctorScheduleOverride;
const deleteDoctorScheduleOverride = async (input) => {
    const { clinicId, doctorId, overrideId } = input;
    if (!clinicId || !doctorId || !overrideId) {
        throw new ValidationError('clinicId, doctorId and overrideId are required');
    }
    const docRef = overridesRef(clinicId, doctorId).doc(overrideId);
    const snap = await docRef.get();
    if (!snap.exists) {
        throw new NotFoundError('override not found');
    }
    await docRef.delete();
    return { deleted: true };
};
exports.deleteDoctorScheduleOverride = deleteDoctorScheduleOverride;
//# sourceMappingURL=mutations.js.map