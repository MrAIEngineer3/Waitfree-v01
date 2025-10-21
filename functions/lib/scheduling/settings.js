"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveClinicSchedulingSettings = exports.loadClinicSchedulingSettings = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firebaseAdmin_1 = require("../firebaseAdmin");
const availabilitySettingsRef = (clinicId) => firebaseAdmin_1.admin.firestore().collection('clinics').doc(clinicId).collection('settings').doc('availability');
const normalizeSettings = (raw) => {
    if (!raw) {
        return {};
    }
    return {
        manualCheckInRequired: raw.manualCheckInRequired === true,
        allowOfflineSignups: raw.allowOfflineSignups === true
    };
};
const loadClinicSchedulingSettings = async (clinicId) => {
    if (!clinicId) {
        return {};
    }
    const snap = await availabilitySettingsRef(clinicId).get();
    const settings = normalizeSettings(snap.exists ? snap.data() : undefined);
    return settings;
};
exports.loadClinicSchedulingSettings = loadClinicSchedulingSettings;
const saveClinicSchedulingSettings = async (clinicId, input) => {
    if (!clinicId) {
        throw new Error('clinicId is required');
    }
    const ref = availabilitySettingsRef(clinicId);
    const manual = input.manualCheckInRequired === true;
    const allow = manual && input.allowOfflineSignups === true;
    await ref.set({
        manualCheckInRequired: manual,
        allowOfflineSignups: allow,
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    }, { merge: true });
    return {
        manualCheckInRequired: manual,
        allowOfflineSignups: allow
    };
};
exports.saveClinicSchedulingSettings = saveClinicSchedulingSettings;
//# sourceMappingURL=settings.js.map