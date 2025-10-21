import { admin } from '../firebaseAdmin';
import { DateTime } from 'luxon';
import { Timestamp } from 'firebase-admin/firestore';

import {
  DoctorSchedulingDocument,
  ScheduleOverride,
  BlockerOverride,
  ExceptionOverride
} from './types';

const db = admin.firestore();

const DOCTORS_COLLECTION_PATH = (clinicId: string) => db.collection('clinics').doc(clinicId).collection('doctors');

const DEFAULT_OVERRIDE_LOOKBACK_DAYS = 14;
const DEFAULT_OVERRIDE_LOOKAHEAD_DAYS = 30;
const MAX_OVERRIDE_QUERY_LIMIT = 100;

export interface LoadOverridesOptions {
  reference: Date;
  lookBackDays?: number;
  lookAheadDays?: number;
}

export interface DoctorSchedulingSnapshot {
  document: DoctorSchedulingDocument;
  overrides: ScheduleOverride[];
  doctorRef: admin.firestore.DocumentReference;
}

const toTimestamp = (date: Date): Timestamp => Timestamp.fromDate(date);

const parseScheduleDocument = (raw: admin.firestore.DocumentData | undefined): DoctorSchedulingDocument => {
  if (!raw) {
    return {};
  }
  const scheduling = raw.scheduling as DoctorSchedulingDocument | undefined;
  if (!scheduling) {
    return {};
  }
  return scheduling;
};

const convertOverride = (doc: admin.firestore.QueryDocumentSnapshot): ScheduleOverride | null => {
  const data = doc.data();
  const base = {
    id: doc.id,
    type: data.type,
    start: data.start,
    end: data.end,
    note: data.note ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null
  } as const;

  if (!base.start || !base.end) {
    return null;
  }

  if (data.type === 'blocker') {
    const override: BlockerOverride = {
      ...base,
      type: 'blocker',
      reasonCode: data.reasonCode ?? null
    };
    return override;
  }

  if (data.type === 'exception') {
    const override: ExceptionOverride = {
      ...base,
      type: 'exception',
      label: data.label ?? null
    };
    return override;
  }

  return null;
};

const dedupeOverrides = (items: ScheduleOverride[]): ScheduleOverride[] => {
  const map = new Map<string, ScheduleOverride>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return Array.from(map.values()).sort((a, b) => a.start.toMillis() - b.start.toMillis());
};

export const loadDoctorSchedulingSnapshot = async (
  clinicId: string,
  doctorId: string,
  options?: Partial<LoadOverridesOptions>
): Promise<DoctorSchedulingSnapshot> => {
  const ref = DOCTORS_COLLECTION_PATH(clinicId).doc(doctorId);
  const snap = await ref.get();
  const document = parseScheduleDocument(snap.data());

  const reference = options?.reference ?? new Date();
  const lookBackDays = options?.lookBackDays ?? DEFAULT_OVERRIDE_LOOKBACK_DAYS;
  const lookAheadDays = options?.lookAheadDays ?? DEFAULT_OVERRIDE_LOOKAHEAD_DAYS;

  const refDateTime = DateTime.fromJSDate(reference);
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

  const overrides: ScheduleOverride[] = [];

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
