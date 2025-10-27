import * as functions from 'firebase-functions/v1';

import { admin } from '../firebaseAdmin';
import { enqueueDoctorOnlineNotification, shouldEnqueueForStatus } from './notificationQueue';
import { resolveDoctorAvailability } from './availability';
import { loadClinicSchedulingSettings } from './settings';
import { requireNormalizedPhone, PhoneNormalizationError } from '../utils/phone';
import type {
  ClinicSchedulingSettings,
  DoctorAvailabilityResult,
  RealTimeStatus
} from './types';

type HttpsErrorCtor = new (code: functions.https.FunctionsErrorCode, message: string, details?: unknown) => Error;

type Logger = Pick<typeof functions.logger, 'info' | 'error'>;

type CallableContext = functions.https.CallableContext;

type RequestDoctorOnlineNotificationInput = {
  clinicId?: string;
  doctorId?: string;
  patientName?: string;
  phone?: string;
};

type EnqueueResult = {
  alreadyQueued: boolean;
  status: 'pending' | 'sent';
};

type EnqueueFn = (input: {
  clinicId: string;
  doctorId: string;
  patientName?: string | null;
  phone: string;
  source?: 'patient-app' | 'staff';
  doctorName?: string | null;
}) => Promise<EnqueueResult>;

type ClinicSettingsLoader = (clinicId: string) => Promise<ClinicSchedulingSettings>;

type AvailabilityResolver = (input: {
  clinicId: string;
  doctorId: string;
  settings?: ClinicSchedulingSettings;
}) => Promise<DoctorAvailabilityResult>;

type EnqueueEligibilityFn = (
  status: RealTimeStatus | null,
  options: { settings?: ClinicSchedulingSettings | null }
) => boolean;

type RequestDoctorOnlineNotificationDeps = {
  loadClinicSchedulingSettings: ClinicSettingsLoader;
  resolveDoctorAvailability: AvailabilityResolver;
  shouldEnqueueForStatus: EnqueueEligibilityFn;
  enqueueDoctorOnlineNotification: EnqueueFn;
  logger: Logger;
  HttpsError: HttpsErrorCtor;
};

const serializeRealTimeStatus = (status: RealTimeStatus | null | undefined) => {
  if (!status) {
    return null;
  }

  let updatedAtIso: string | null = null;
  const rawUpdatedAt = status.updatedAt as any;
  if (rawUpdatedAt) {
    if (typeof rawUpdatedAt.toDate === 'function') {
      updatedAtIso = rawUpdatedAt.toDate().toISOString();
    } else if (rawUpdatedAt instanceof Date) {
      updatedAtIso = rawUpdatedAt.toISOString();
    } else if (typeof rawUpdatedAt === 'string') {
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

const defaultDeps: RequestDoctorOnlineNotificationDeps = {
  loadClinicSchedulingSettings,
  resolveDoctorAvailability: (input) =>
    resolveDoctorAvailability({ clinicId: input.clinicId, doctorId: input.doctorId, settings: input.settings }),
  shouldEnqueueForStatus,
  enqueueDoctorOnlineNotification,
  logger: functions.logger,
  HttpsError: functions.https.HttpsError
};

export const createRequestDoctorOnlineNotificationHandler = (
  overrides: Partial<RequestDoctorOnlineNotificationDeps> = {}
) => {
  const deps: RequestDoctorOnlineNotificationDeps = {
    ...defaultDeps,
    ...overrides
  };

  return async (data: RequestDoctorOnlineNotificationInput, context: CallableContext) => {
    const clinicId = typeof data?.clinicId === 'string' ? data.clinicId.trim() : '';
    const doctorId = typeof data?.doctorId === 'string' ? data.doctorId.trim() : '';
    const phone = typeof data?.phone === 'string' ? data.phone.trim() : '';
    const patientName = typeof data?.patientName === 'string' ? data.patientName.trim() : undefined;

    if (!clinicId || !doctorId || !phone) {
      throw new deps.HttpsError('invalid-argument', 'clinicId, doctorId and phone are required');
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = requireNormalizedPhone(phone);
    } catch (error) {
      const message = error instanceof PhoneNormalizationError ? error.message : 'Invalid phone number';
      throw new deps.HttpsError('invalid-argument', message);
    }

    const doctorRef = admin.firestore().collection('clinics').doc(clinicId).collection('doctors').doc(doctorId);
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
        success: false as const,
        alreadyOnline: true as const,
        availability: availabilitySummary
      };
    }

    const eligible = deps.shouldEnqueueForStatus(availability.realTimeStatus ?? null, {
      settings: clinicSchedulingSettings
    });

    const eligibilityLog: Record<string, unknown> = {
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
        success: false as const,
        alreadyOnline: false as const,
        enqueueEligible: false as const,
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
        success: true as const,
        alreadyQueued: enqueueResult.alreadyQueued,
        status: enqueueResult.status,
        availability: availabilitySummary
      };
    } catch (error) {
      deps.logger.error('Failed to enqueue doctor online notification', {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        clinicId,
        doctorId
      });
      throw new deps.HttpsError('internal', 'Failed to enqueue notification');
    }
  };
};

export type RequestDoctorOnlineNotificationHandler = ReturnType<typeof createRequestDoctorOnlineNotificationHandler>;
