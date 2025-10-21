import type { DoctorAvailabilityPayload } from './availability';

export interface JoinEligibilityContext {
  clinicSettings?: {
    manualCheckInRequired?: boolean;
    allowOfflineSignups?: boolean;
  } | null;
}

export interface JoinEligibilityResult {
  allowJoin: boolean;
  reason?: string | null;
}

export const evaluateJoinEligibility = (
  availability: DoctorAvailabilityPayload | null | undefined,
  context?: JoinEligibilityContext
): JoinEligibilityResult => {
  const manualCheckInRequired = context?.clinicSettings?.manualCheckInRequired === true;
  const allowOfflineSignups = context?.clinicSettings?.allowOfflineSignups === true;

  if (!availability) {
    return { allowJoin: true };
  }

  if (availability.status === 'AVAILABLE') {
    return { allowJoin: true };
  }

  if (manualCheckInRequired && availability.reasonCode === 'REALTIME_OFFLINE') {
    return {
      allowJoin: false,
      reason: allowOfflineSignups
        ? 'The kiosk is offline. Please share your details with the front desk so they can add you.'
        : 'Please speak with the front desk so they can check you in manually.'
    };
  }

  return {
    allowJoin: false,
    reason: availability.message ?? 'Doctor is currently unavailable.'
  };
};

export interface CallableErrorLike {
  code: string;
  message: string;
  details?: unknown;
}

export const isCallableError = (value: unknown): value is CallableErrorLike => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
};

const coerceString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  return null;
};

const coerceBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
};

const coerceAvailabilityOverride = (
  value: unknown
): DoctorAvailabilityPayload['activeOverride'] => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = coerceString(raw.id);
  const type = raw.type === 'exception' ? 'exception' : raw.type === 'blocker' ? 'blocker' : null;
  const start = coerceString(raw.start);
  const end = coerceString(raw.end);
  if (!id || !type || !start || !end) {
    return null;
  }
  return {
    id,
    type,
    start,
    end,
    note: raw.note == null ? null : coerceString(raw.note) ?? null,
    createdAt: coerceString(raw.createdAt),
    updatedAt: coerceString(raw.updatedAt),
    reasonCode: raw.reasonCode == null ? null : coerceString(raw.reasonCode),
    label: raw.label == null ? null : coerceString(raw.label)
  };
};

const coerceRealTimeStatus = (
  value: unknown
): DoctorAvailabilityPayload['realTimeStatus'] => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const online = coerceBoolean(raw.online);
  if (online === null) {
    return null;
  }
  return {
    online,
    note: raw.note == null ? null : coerceString(raw.note),
    source: raw.source == null ? null : coerceString(raw.source),
    updatedAt: coerceString(raw.updatedAt)
  };
};

export const deserializeAvailabilityPayload = (
  value: unknown
): DoctorAvailabilityPayload | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const statusRaw = coerceString(raw.status);
  if (!statusRaw) {
    return null;
  }

  const status = statusRaw === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE';
  const layer = coerceString(raw.layer) ?? 'UNKNOWN';
  const reasonCode = coerceString(raw.reasonCode) ?? 'UNKNOWN';
  const computedAt = coerceString(raw.computedAt) ?? new Date().toISOString();
  const message = raw.message == null ? null : coerceString(raw.message) ?? null;
  const nextAvailableAt = raw.nextAvailableAt == null ? null : coerceString(raw.nextAvailableAt) ?? null;
  const activeOverride = raw.activeOverride == null ? null : coerceAvailabilityOverride(raw.activeOverride);
  const realTimeStatus = raw.realTimeStatus == null ? null : coerceRealTimeStatus(raw.realTimeStatus);
  const debug = typeof raw.debug === 'object' && raw.debug !== null ? (raw.debug as Record<string, unknown>) : null;

  return {
    status,
    layer,
    reasonCode,
    message,
    computedAt,
    nextAvailableAt,
    activeOverride,
    realTimeStatus,
    debug
  };
};
