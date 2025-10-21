"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDoctorSchedulingSnapshot = void 0;
const firebaseAdmin_1 = require("../firebaseAdmin");
const luxon_1 = require("luxon");
const firestore_1 = require("firebase-admin/firestore");
const db = firebaseAdmin_1.admin.firestore();
const DOCTORS_COLLECTION_PATH = (clinicId) => db.collection('clinics').doc(clinicId).collection('doctors');
const DEFAULT_OVERRIDE_LOOKBACK_DAYS = 14;
const DEFAULT_OVERRIDE_LOOKAHEAD_DAYS = 30;
const MAX_OVERRIDE_QUERY_LIMIT = 100;
const toTimestamp = (date) => firestore_1.Timestamp.fromDate(date);
const parseScheduleDocument = (raw) => {
    if (!raw) {
        return {};
    }
    const scheduling = raw.scheduling;
    if (!scheduling) {
        return {};
    }
    return scheduling;
};
const convertOverride = (doc) => {
    const data = doc.data();
    const base = {
        id: doc.id,
        type: data.type,
        start: data.start,
        end: data.end,
        note: data.note ?? null,
        createdAt: data.createdAt ?? null,
        updatedAt: data.updatedAt ?? null
    };
    if (!base.start || !base.end) {
        return null;
    }
    if (data.type === 'blocker') {
        const override = {
            ...base,
            type: 'blocker',
            reasonCode: data.reasonCode ?? null
        };
        return override;
    }
    if (data.type === 'exception') {
        const override = {
            ...base,
            type: 'exception',
            label: data.label ?? null
        };
        return override;
    }
    return null;
};
const dedupeOverrides = (items) => {
    const map = new Map();
    for (const item of items) {
        map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => a.start.toMillis() - b.start.toMillis());
};
const loadDoctorSchedulingSnapshot = async (clinicId, doctorId, options) => {
    const ref = DOCTORS_COLLECTION_PATH(clinicId).doc(doctorId);
    const snap = await ref.get();
    const document = parseScheduleDocument(snap.data());
    const reference = options?.reference ?? new Date();
    const lookBackDays = options?.lookBackDays ?? DEFAULT_OVERRIDE_LOOKBACK_DAYS;
    const lookAheadDays = options?.lookAheadDays ?? DEFAULT_OVERRIDE_LOOKAHEAD_DAYS;
    const refDateTime = luxon_1.DateTime.fromJSDate(reference);
    const lookBackBoundary = refDateTime.minus({ days: lookBackDays }).toJSDate();
    const lookAheadBoundary = refDateTime.plus({ days: lookAheadDays }).toJSDate();
    const overridesRef = ref.collection('schedulingOverrides');
    const [boundedSnapshot, longRunningSnapshot] = await Promise.all([
        overridesRef
            .where('start', '>=', toTimestamp(lookBackBoundary))
            .where('start', '<=', toTimestamp(lookAheadBoundary))
            .orderBy('start', 'asc')
            .limit(MAX_OVERRIDE_QUERY_LIMIT)
            .get(),
        overridesRef
            .where('end', '>=', toTimestamp(reference))
            .orderBy('end', 'asc')
            .limit(MAX_OVERRIDE_QUERY_LIMIT)
            .get()
    ]);
    const overrides = [];
    for (const docSnap of boundedSnapshot.docs) {
        const override = convertOverride(docSnap);
        if (override) {
            overrides.push(override);
        }
    }
    for (const docSnap of longRunningSnapshot.docs) {
        const override = convertOverride(docSnap);
        if (override) {
            overrides.push(override);
        }
    }
    return {
        doctorRef: ref,
        document,
        overrides: dedupeOverrides(overrides)
    };
};
exports.loadDoctorSchedulingSnapshot = loadDoctorSchedulingSnapshot;
//# sourceMappingURL=firestore.js.map