import { FieldValue } from '@google-cloud/firestore';
import { admin } from '../firebaseAdmin';
import { DateTime } from 'luxon';
import { Timestamp } from 'firebase-admin/firestore';

import type {
  DefaultWeeklyRota,
  RealTimeStatus,
  ScheduleOverride,
  OverrideType
} from './types';
import {
  ensureValidTimeZone,
  filterValidDays,
  normalizeWeekDefinition
} from './utils';

const db = admin.firestore();

const MAX_NOTE_LENGTH = 280;

const sliceNote = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_NOTE_LENGTH);
};

const sanitizeSource = (value: unknown): RealTimeStatus['source'] => {
  if (value === 'system' || value === 'automation') {
    return value;
  }
  return 'staff';
};

const doctorRef = (clinicId: string, doctorId: string) =>
  db.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface SetRealTimeStatusInput {
  clinicId: string;
  doctorId: string;
  online: boolean;
  note?: unknown;
  source?: unknown;
}

export interface SetRealTimeStatusResult {
  previousStatus: RealTimeStatus | null;
  updatedStatus: RealTimeStatus;
  changed: boolean;
  doctorId: string;
  clinicId: string;
}

export const setDoctorRealTimeStatus = async (
  input: SetRealTimeStatusInput
): Promise<SetRealTimeStatusResult> => {
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
    const scheduling = (docData.scheduling || {}) as { realTimeStatus?: RealTimeStatus };
    const prev = scheduling.realTimeStatus ?? null;

    const newStatus: RealTimeStatus = {
      online,
      note,
      source,
  updatedAt: FieldValue.serverTimestamp() as unknown as Timestamp
    };

    tx.set(
      ref,
      {
        scheduling: {
          realTimeStatus: newStatus
        }
      },
      { merge: true }
    );

    const changedFlag = prev ? prev.online !== online : true;

    return {
      previousStatus: prev,
      changed: changedFlag
    };
  });

  const latestSnap = await ref.get();
  const latestScheduling = (latestSnap.data()?.scheduling || {}) as { realTimeStatus?: RealTimeStatus };
  const updatedStatus = latestScheduling.realTimeStatus ?? null;
  if (!updatedStatus) {
    throw new Error('Failed to read updated real-time status');
  }

  return { previousStatus, updatedStatus, changed, clinicId, doctorId };
};

export interface UpdateDefaultRotaInput {
  clinicId: string;
  doctorId: string;
  timeZone: string;
  week: Partial<Record<string, unknown>>;
}

export const updateDoctorDefaultRota = async (
  input: UpdateDefaultRotaInput
): Promise<DefaultWeeklyRota> => {
  const { clinicId, doctorId, timeZone } = input;
  if (!clinicId || !doctorId) {
    throw new ValidationError('clinicId and doctorId are required');
  }
  if (!ensureValidTimeZone(timeZone)) {
    throw new ValidationError('timeZone must be a valid IANA zone');
  }

  const weekInput = filterValidDays((input.week ?? {}) as Record<string, any[]>);
  const normalized = normalizeWeekDefinition(weekInput);
  if (!normalized) {
    throw new ValidationError('week definition is invalid or contains overlapping blocks');
  }

  const ref = doctorRef(clinicId, doctorId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.data()?.scheduling?.defaultRota as DefaultWeeklyRota | undefined;
    const currentVersion = typeof existing?.version === 'number' ? existing.version : 0;
    const nextVersion = currentVersion + 1;

    const rota: DefaultWeeklyRota = {
      timeZone,
      week: normalized,
      version: nextVersion,
  updatedAt: FieldValue.serverTimestamp() as unknown as Timestamp
    };

    tx.set(
      ref,
      {
        scheduling: {
          defaultRota: rota
        }
      },
      { merge: true }
    );

    return rota;
  });

  return result;
};

const parseDateTime = (value: unknown, label: string): DateTime => {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be an ISO-8601 string`);
  }
  const dt = DateTime.fromISO(value, { setZone: true });
  if (!dt.isValid) {
    throw new ValidationError(`${label} must be a valid ISO-8601 date`);
  }
  return dt.toUTC();
};

const assertOverrideType = (value: unknown): OverrideType => {
  if (value === 'blocker' || value === 'exception') {
    return value;
  }
  throw new ValidationError('type must be blocker or exception');
};

const overridesRef = (clinicId: string, doctorId: string) => doctorRef(clinicId, doctorId).collection('schedulingOverrides');

interface OverridePayloadBase {
  clinicId: string;
  doctorId: string;
  overrideId?: string;
  type: OverrideType;
  start: string;
  end: string;
  note?: unknown;
}

interface BlockerPayload extends OverridePayloadBase {
  type: 'blocker';
  reasonCode?: unknown;
}

interface ExceptionPayload extends OverridePayloadBase {
  type: 'exception';
  label?: unknown;
}

export type CreateOverrideInput = (BlockerPayload | ExceptionPayload) & { overrideId?: string };

const sanitizeOverrideInput = (payload: CreateOverrideInput) => {
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

  const base: Partial<ScheduleOverride> & {
    type: OverrideType;
  start: Timestamp;
  end: Timestamp;
    note?: string | null;
  } = {
    type,
  start: Timestamp.fromDate(start.toJSDate()),
  end: Timestamp.fromDate(end.toJSDate()),
    note: note ?? null
  };

  if (type === 'blocker') {
    const blockerPayload = payload as BlockerPayload;
    const reasonCode = typeof blockerPayload.reasonCode === 'string' ? blockerPayload.reasonCode.trim().slice(0, 80) : null;
    return { clinicId, doctorId, type, data: { ...base, reasonCode } };
  }

  const exceptionPayload = payload as ExceptionPayload;
  const label = typeof exceptionPayload.label === 'string' ? exceptionPayload.label.trim().slice(0, 120) : null;
  return { clinicId, doctorId, type, data: { ...base, label } };
};

export interface CreateOverrideResult {
  id: string;
  override: ScheduleOverride;
}

export const createDoctorScheduleOverride = async (
  payload: CreateOverrideInput
): Promise<CreateOverrideResult> => {
  const { clinicId, doctorId, data, type } = sanitizeOverrideInput(payload);
  const overrides = overridesRef(clinicId, doctorId);
  const docRef = payload.overrideId ? overrides.doc(payload.overrideId) : overrides.doc();

  await docRef.set({
    ...data,
    type,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  const saved = await docRef.get();
  if (!saved.exists) {
    throw new Error('Failed to read override after creation');
  }

  return { id: docRef.id, override: saved.data() as ScheduleOverride };
};

export const updateDoctorScheduleOverride = async (
  payload: CreateOverrideInput
): Promise<CreateOverrideResult> => {
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
    updatedAt: FieldValue.serverTimestamp()
  });

  const saved = await docRef.get();
  return { id: docRef.id, override: saved.data() as ScheduleOverride };
};

export interface DeleteOverrideInput {
  clinicId: string;
  doctorId: string;
  overrideId: string;
}

export const deleteDoctorScheduleOverride = async (
  input: DeleteOverrideInput
): Promise<{ deleted: boolean }> => {
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
