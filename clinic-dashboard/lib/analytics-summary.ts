import type { AnalyticsDataSource, DailyAnalyticsRecord } from '@/types/analytics';

export interface AggregatedAnalyticsSummary {
  totalPatients: number;
  completedPatients: number;
  cancelledPatients: number;
  waitingPatients: number;
  inProgressPatients: number;
  dayCount: number;
  completionRate: number | null;
  cancellationRate: number | null;
  averageWaitMinutes: number | null;
  averageServiceMinutes: number | null;
  waitSamples: number;
  serviceSamples: number;
  firstDate: Date | null;
  lastDate: Date | null;
  counterSourceBreakdown: Record<AnalyticsDataSource, number>;
  metricsSourceBreakdown: Record<AnalyticsDataSource, number>;
}

const createSourceBreakdown = (): Record<AnalyticsDataSource, number> => ({
  queue: 0,
  patients: 0,
});

interface AggregationAccumulator {
  totalPatients: number;
  completedPatients: number;
  cancelledPatients: number;
  waitingPatients: number;
  inProgressPatients: number;
  waitSamples: number;
  serviceSamples: number;
  totalWaitMinutesWeighted: number;
  totalServiceMinutesWeighted: number;
  counterSourceBreakdown: Record<AnalyticsDataSource, number>;
  metricsSourceBreakdown: Record<AnalyticsDataSource, number>;
  firstDate: Date | null;
  lastDate: Date | null;
}

const initialAccumulator: AggregationAccumulator = {
  totalPatients: 0,
  completedPatients: 0,
  cancelledPatients: 0,
  waitingPatients: 0,
  inProgressPatients: 0,
  waitSamples: 0,
  serviceSamples: 0,
  totalWaitMinutesWeighted: 0,
  totalServiceMinutesWeighted: 0,
  counterSourceBreakdown: createSourceBreakdown(),
  metricsSourceBreakdown: createSourceBreakdown(),
  firstDate: null,
  lastDate: null,
};

export const computeAnalyticsSummary = (
  records: DailyAnalyticsRecord[] | undefined | null
): AggregatedAnalyticsSummary | null => {
  if (!records || records.length === 0) {
    return null;
  }

  const accumulator = records.reduce<AggregationAccumulator>((acc, record) => {
    const next = { ...acc };

    next.totalPatients += record.totalPatients;
    next.completedPatients += record.completedPatients;
    next.cancelledPatients += record.cancelledPatients;
    next.waitingPatients += record.waitingPatients;
    next.inProgressPatients += record.inProgressPatients;

    next.waitSamples += record.waitSamples;
    next.serviceSamples += record.serviceSamples;

    if (record.avgWaitMinutes != null && record.waitSamples > 0) {
      next.totalWaitMinutesWeighted += record.avgWaitMinutes * record.waitSamples;
    }
    if (record.avgServiceMinutes != null && record.serviceSamples > 0) {
      next.totalServiceMinutesWeighted += record.avgServiceMinutes * record.serviceSamples;
    }

    next.counterSourceBreakdown = {
      ...next.counterSourceBreakdown,
      [record.counterSource]: (next.counterSourceBreakdown[record.counterSource] ?? 0) + 1,
    };

    next.metricsSourceBreakdown = {
      ...next.metricsSourceBreakdown,
      [record.metricsSource]: (next.metricsSourceBreakdown[record.metricsSource] ?? 0) + 1,
    };

    if (record.date) {
      if (!next.firstDate || record.date < next.firstDate) {
        next.firstDate = record.date;
      }
      if (!next.lastDate || record.date > next.lastDate) {
        next.lastDate = record.date;
      }
    }

    return next;
  }, initialAccumulator);

  const completionRate =
    accumulator.totalPatients > 0
      ? (accumulator.completedPatients / accumulator.totalPatients) * 100
      : null;

  const cancellationRate =
    accumulator.totalPatients > 0
      ? (accumulator.cancelledPatients / accumulator.totalPatients) * 100
      : null;

  const averageWaitMinutes =
    accumulator.waitSamples > 0
      ? accumulator.totalWaitMinutesWeighted / accumulator.waitSamples
      : null;

  const averageServiceMinutes =
    accumulator.serviceSamples > 0
      ? accumulator.totalServiceMinutesWeighted / accumulator.serviceSamples
      : null;

  return {
    totalPatients: accumulator.totalPatients,
    completedPatients: accumulator.completedPatients,
    cancelledPatients: accumulator.cancelledPatients,
    waitingPatients: accumulator.waitingPatients,
    inProgressPatients: accumulator.inProgressPatients,
    dayCount: records.length,
    completionRate,
    cancellationRate,
    averageWaitMinutes,
    averageServiceMinutes,
    waitSamples: accumulator.waitSamples,
    serviceSamples: accumulator.serviceSamples,
    firstDate: accumulator.firstDate,
    lastDate: accumulator.lastDate,
    counterSourceBreakdown: accumulator.counterSourceBreakdown,
    metricsSourceBreakdown: accumulator.metricsSourceBreakdown,
  } satisfies AggregatedAnalyticsSummary;
};
