export type AnalyticsDataSource = 'queue' | 'patients';

export interface DailyAnalyticsRecord {
  id: string;
  queueId: string;
  clinicId: string;
  doctorId: string;
  date: Date | null;
  totalPatients: number;
  completedPatients: number;
  cancelledPatients: number;
  waitingPatients: number;
  inProgressPatients: number;
  serviceSamples: number;
  waitSamples: number;
  avgServiceMinutes: number | null;
  avgWaitMinutes: number | null;
  rollingAvgServiceMinutes: number | null;
  rollingAvgWaitMinutes: number | null;
  counterSource: AnalyticsDataSource;
  metricsSource: AnalyticsDataSource;
  aggregationVersion: number | null;
  updatedAt: Date | null;
}
