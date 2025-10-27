"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestDoctorOnlineNotificationHandler = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const firebaseAdmin_1 = require("../firebaseAdmin");
const notificationQueue_1 = require("./notificationQueue");
const availability_1 = require("./availability");
const settings_1 = require("./settings");
const phone_1 = require("../utils/phone");
const serializeRealTimeStatus = (status) => {
    if (!status) {
        return null;
    }
    let updatedAtIso = null;
    const rawUpdatedAt = status.updatedAt;
    if (rawUpdatedAt) {
        if (typeof rawUpdatedAt.toDate === 'function') {
            updatedAtIso = rawUpdatedAt.toDate().toISOString();
        }
        else if (rawUpdatedAt instanceof Date) {
            updatedAtIso = rawUpdatedAt.toISOString();
        }
        else if (typeof rawUpdatedAt === 'string') {
            updatedAtIso = rawUpdatedAt;
        }
    }
    return {
        online: status.online === true,
        note: typeof status.note === 'string' ? status.note : null,
        source: typeof status.source === 'string' ? status.source : null,
        updatedAt: updatedAtIso
    };
};
const defaultDeps = {
    loadClinicSchedulingSettings: settings_1.loadClinicSchedulingSettings,
    resolveDoctorAvailability: (input) => (0, availability_1.resolveDoctorAvailability)({ clinicId: input.clinicId, doctorId: input.doctorId, settings: input.settings }),
    shouldEnqueueForStatus: notificationQueue_1.shouldEnqueueForStatus,
    enqueueDoctorOnlineNotification: notificationQueue_1.enqueueDoctorOnlineNotification,
    logger: functions.logger,
    HttpsError: functions.https.HttpsError
};
const createRequestDoctorOnlineNotificationHandler = (overrides = {}) => {
    const deps = {
        ...defaultDeps,
        ...overrides
    };
    return async (data, context) => {
        const clinicId = typeof data?.clinicId === 'string' ? data.clinicId.trim() : '';
        const doctorId = typeof data?.doctorId === 'string' ? data.doctorId.trim() : '';
        const phone = typeof data?.phone === 'string' ? data.phone.trim() : '';
        const patientName = typeof data?.patientName === 'string' ? data.patientName.trim() : undefined;
        if (!clinicId || !doctorId || !phone) {
            throw new deps.HttpsError('invalid-argument', 'clinicId, doctorId and phone are required');
        }
        let normalizedPhone;
        try {
            normalizedPhone = (0, phone_1.requireNormalizedPhone)(phone);
        }
        catch (error) {
            const message = error instanceof phone_1.PhoneNormalizationError ? error.message : 'Invalid phone number';
            throw new deps.HttpsError('invalid-argument', message);
        }
        const doctorRef = firebaseAdmin_1.admin.firestore().collection('clinics').doc(clinicId).collection('doctors').doc(doctorId);
        const doctorSnap = await doctorRef.get();
        if (!doctorSnap.exists) {
            throw new deps.HttpsError('not-found', 'Doctor not found');
        }
        const doctorData = doctorSnap.data() || {};
        const doctorName = typeof doctorData.name === 'string' ? doctorData.name : null;
        const clinicSchedulingSettings = await deps.loadClinicSchedulingSettings(clinicId);
        const availability = await deps.resolveDoctorAvailability({ clinicId, doctorId, settings: clinicSchedulingSettings });
        const availabilitySummary = {
            status: availability.status,
            layer: availability.layer,
            reasonCode: availability.reasonCode,
            message: availability.message ?? null,
            nextAvailableAt: availability.nextAvailableAt ? availability.nextAvailableAt.toISOString() : null,
            realTimeStatus: serializeRealTimeStatus(availability.realTimeStatus ?? null)
        };
        if (availability.status === 'AVAILABLE') {
            return {
                success: false,
                alreadyOnline: true,
                availability: availabilitySummary
            };
        }
        const eligible = deps.shouldEnqueueForStatus(availability.realTimeStatus ?? null, {
            settings: clinicSchedulingSettings
        });
        const eligibilityLog = {
            clinicId,
            doctorId,
            eligible,
            availabilityStatus: availability.status,
            availabilityLayer: availability.layer,
            availabilityReason: availability.reasonCode,
            manualCheckInRequired: clinicSchedulingSettings?.manualCheckInRequired === true,
            allowOfflineSignups: clinicSchedulingSettings?.allowOfflineSignups === true,
            realTimeStatus: availabilitySummary.realTimeStatus
        };
        if (availability.debug) {
            eligibilityLog.availabilityDebug = availability.debug;
        }
        deps.logger.info('requestDoctorOnlineNotification eligibility evaluated', eligibilityLog);
        if (!eligible) {
            return {
                success: false,
                alreadyOnline: false,
                enqueueEligible: false,
                availability: availabilitySummary
            };
        }
        try {
            const enqueueResult = await deps.enqueueDoctorOnlineNotification({
                clinicId,
                doctorId,
                phone: normalizedPhone,
                patientName: patientName ?? null,
                source: context.auth ? 'staff' : 'patient-app',
                doctorName
            });
            return {
                success: true,
                alreadyQueued: enqueueResult.alreadyQueued,
                status: enqueueResult.status,
                availability: availabilitySummary
            };
        }
        catch (error) {
            deps.logger.error('Failed to enqueue doctor online notification', {
                error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
                clinicId,
                doctorId
            });
            throw new deps.HttpsError('internal', 'Failed to enqueue notification');
        }
    };
};
exports.createRequestDoctorOnlineNotificationHandler = createRequestDoctorOnlineNotificationHandler;
//# sourceMappingURL=requestDoctorOnlineNotification.js.map