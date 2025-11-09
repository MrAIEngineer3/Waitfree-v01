import { useQuery } from '@tanstack/react-query';
import { isValid, parseISO } from 'date-fns';
import {
    collection,
    documentId,
    getDocs,
    orderBy,
    query,
    Timestamp,
    where,
    type QueryConstraint,
} from 'firebase/firestore';
import { useMemo } from 'react';
import type { DateRange } from 'react-day-picker';

import { formatDateKey } from '@/lib/time';
import type { AnalyticsDataSource, DailyAnalyticsRecord } from '@/types/analytics';
import { db } from '../firebase';

interface UseDailyAnalyticsOptions {
  clinicId: string | null | undefined;
  doctorId: string | null | undefined;
  range: DateRange | undefined;
  enabled?: boolean;
}

interface FirestoreTimestampLike {
  toDate?: () => Date;
}

const toNumber = (value: unknown, fallback = 0): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const toNullableNumber = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const toDataSource = (value: unknown): AnalyticsDataSource => {
  return value === 'patients' ? 'patients' : 'queue';
};

const toDateSafe = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (typeof (value as FirestoreTimestampLike)?.toDate === 'function') {
    try {
      const date = (value as FirestoreTimestampLike).toDate?.();
      return date && isValid(date) ? date : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  }
  return null;
};

const deriveDocDate = (id: string): Date | null => {
  if (!id) {
    return null;
  }
  const parsed = parseISO(id);
  return isValid(parsed) ? parsed : null;
};

const coerceRange = (range: DateRange | undefined): DateRange | undefined => {
  if (!range) {
    return undefined;
  }
  const { from, to } = range;
  if (!from && !to) {
    return undefined;
  }
  if (from && to) {
    if (from <= to) {
      return { from, to };
    }
    return { from: to, to: from };
  }
  return {
    from: from ?? to ?? undefined,
    to: to ?? from ?? undefined,
  };
};

interface FetchDailyAnalyticsParams {
  clinicId: string;
  doctorId: string;
  range: DateRange | undefined;
}

async function fetchDailyAnalytics({ clinicId, doctorId, range }: FetchDailyAnalyticsParams) {
  const collectionRef = collection(db, 'analytics', clinicId, 'doctors', doctorId, 'daily');

  const normalizedRange = coerceRange(range);
  const constraints: QueryConstraint[] = [orderBy(documentId())];

  const fromKey = normalizedRange?.from ? formatDateKey(normalizedRange.from) : null;
  const toKey = normalizedRange?.to ? formatDateKey(normalizedRange.to) : null;

  if (fromKey) {
    constraints.push(where(documentId(), '>=', fromKey));
  }

  if (toKey) {
    constraints.push(where(documentId(), '<=', toKey));
  }

  const snapshot = await getDocs(query(collectionRef, ...constraints));

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const updatedAt = toDateSafe(data.updatedAt);

    const record: DailyAnalyticsRecord = {
      id: docSnap.id,
      queueId: docSnap.id,
      clinicId: typeof data.clinicId === 'string' ? data.clinicId : clinicId ?? '',
      doctorId: typeof data.doctorId === 'string' ? data.doctorId : doctorId ?? '',
      date: deriveDocDate(docSnap.id),
      totalPatients: toNumber(data.totalPatients),
      completedPatients: toNumber(data.completedPatients),
      cancelledPatients: toNumber(data.cancelledPatients),
      waitingPatients: toNumber(data.waitingPatients),
      inProgressPatients: toNumber(data.inProgressPatients),
      serviceSamples: toNumber(data.serviceSamples),
      waitSamples: toNumber(data.waitSamples),
      avgServiceMinutes: toNullableNumber(data.avgServiceMinutes),
      avgWaitMinutes: toNullableNumber(data.avgWaitMinutes),
      rollingAvgServiceMinutes: toNullableNumber(data.rollingAvgServiceMinutes),
      rollingAvgWaitMinutes: toNullableNumber(data.rollingAvgWaitMinutes),
      counterSource: toDataSource(data.counterSource),
      metricsSource: toDataSource(data.metricsSource),
      aggregationVersion: typeof data.aggregationVersion === 'number' ? data.aggregationVersion : null,
      updatedAt,
    };

    return record;
  });
}

export function useDailyAnalytics({ clinicId, doctorId, range, enabled = true }: UseDailyAnalyticsOptions) {
  const normalizedRange = useMemo(() => coerceRange(range), [range]);

  return useQuery({
    queryKey: [
      'analytics',
      'daily-summary',
      clinicId ?? 'unknown-clinic',
      doctorId ?? 'unknown-doctor',
      normalizedRange?.from ? formatDateKey(normalizedRange.from) : 'open-start',
      normalizedRange?.to ? formatDateKey(normalizedRange.to) : 'open-end',
    ],
    enabled: Boolean(enabled && clinicId && doctorId),
    queryFn: async () => {
      if (!clinicId || !doctorId) {
        return [] as DailyAnalyticsRecord[];
      }
      const resolvedClinicId = clinicId;
      const resolvedDoctorId = doctorId;
      return fetchDailyAnalytics({ clinicId: resolvedClinicId, doctorId: resolvedDoctorId, range: normalizedRange });
    },
    staleTime: 60 * 1000,
  });
}
