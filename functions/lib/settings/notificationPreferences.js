"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNotificationEnabled = exports.getNotificationPreferences = exports.clearNotificationPreferencesCache = void 0;
const firebaseAdmin_1 = require("../firebaseAdmin");
const DEFAULT_PREFERENCES = {
    channels: {
        whatsapp: true,
        sms: false,
        email: false
    },
    events: {
        tokenUpdates: true,
        appointmentReminders: true
    }
};
const CACHE_TTL_MS = 60000;
const cache = new Map();
const normalizeBoolean = (value, fallback) => {
    if (typeof value === 'boolean') {
        return value;
    }
    return fallback;
};
const clonePreferences = (value) => ({
    channels: { ...value.channels },
    events: { ...value.events }
});
const clearNotificationPreferencesCache = (clinicId) => {
    if (!clinicId) {
        cache.clear();
        return;
    }
    cache.delete(clinicId);
};
exports.clearNotificationPreferencesCache = clearNotificationPreferencesCache;
const getNotificationPreferences = async (clinicId) => {
    if (!clinicId) {
        return clonePreferences(DEFAULT_PREFERENCES);
    }
    const cached = cache.get(clinicId);
    if (cached && cached.expiresAt > Date.now()) {
        return clonePreferences(cached.data);
    }
    const docRef = firebaseAdmin_1.admin
        .firestore()
        .collection('clinics')
        .doc(clinicId)
        .collection('settings')
        .doc('notifications');
    const snap = await docRef.get();
    const raw = snap.exists ? snap.data() : undefined;
    const rawChannels = raw?.channels || {};
    const rawEvents = raw?.events || {};
    const resolved = {
        channels: {
            whatsapp: normalizeBoolean(rawChannels.whatsapp, DEFAULT_PREFERENCES.channels.whatsapp),
            sms: normalizeBoolean(rawChannels.sms, DEFAULT_PREFERENCES.channels.sms),
            email: normalizeBoolean(rawChannels.email, DEFAULT_PREFERENCES.channels.email)
        },
        events: {
            tokenUpdates: normalizeBoolean(rawEvents.tokenUpdates, DEFAULT_PREFERENCES.events.tokenUpdates),
            appointmentReminders: normalizeBoolean(rawEvents.appointmentReminders, DEFAULT_PREFERENCES.events.appointmentReminders)
        }
    };
    cache.set(clinicId, { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return clonePreferences(resolved);
};
exports.getNotificationPreferences = getNotificationPreferences;
const isNotificationEnabled = async (options) => {
    const channel = options.channel ?? 'whatsapp';
    const event = options.event ?? 'tokenUpdates';
    const prefs = await (0, exports.getNotificationPreferences)(options.clinicId);
    if (!prefs.channels[channel]) {
        return false;
    }
    if (event && !prefs.events[event]) {
        return false;
    }
    return true;
};
exports.isNotificationEnabled = isNotificationEnabled;
//# sourceMappingURL=notificationPreferences.js.map