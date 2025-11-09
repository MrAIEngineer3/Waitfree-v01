import type { QueueSummaryStats } from '../types/queue';
import type { DashboardQueue, DashboardQueuePatient } from './hooks/use-dashboard-queue-realtime-bridge';

interface ComputeQueueSummaryStatsParams {
  patients: DashboardQueuePatient[] | null | undefined;
  queue: DashboardQueue | null | undefined;
}

const clampProgress = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return Math.round(value);
};

export const computeQueueSummaryStats = ({
  patients,
  queue,
}: ComputeQueueSummaryStatsParams): QueueSummaryStats => {
  const fallbackCurrentToken = typeof queue?.currentToken === 'number' ? queue.currentToken : null;
  const fallbackTotalPatients = typeof queue?.totalPatients === 'number' ? queue.totalPatients : 0;
  const fallbackCompletedPatients = typeof queue?.completedPatients === 'number' ? queue.completedPatients : 0;

  const fallbackSummary: QueueSummaryStats = {
    source: 'legacy',
    currentToken: fallbackCurrentToken,
    total: fallbackTotalPatients,
    completed: fallbackCompletedPatients,
    remaining: Math.max(fallbackTotalPatients - fallbackCompletedPatients, 0),
    progressPct:
      fallbackTotalPatients > 0
        ? clampProgress((fallbackCompletedPatients / fallbackTotalPatients) * 100)
        : 0,
  };

  if (!Array.isArray(patients) || patients.length === 0) {
    return fallbackSummary;
  }

  let waiting = 0;
  let inProgress = 0;
  let completed = 0;
  let cancelled = 0;
  let highestInProgressToken: number | null = null;
  let highestCompletedToken: number | null = null;

  for (const patient of patients) {
    const tokenNumber = typeof patient.tokenNumber === 'number' ? patient.tokenNumber : null;

    switch (patient.status) {
      case 'waiting':
        waiting += 1;
        break;
      case 'in-progress':
        inProgress += 1;
        if (tokenNumber !== null) {
          highestInProgressToken = highestInProgressToken === null
            ? tokenNumber
            : Math.max(highestInProgressToken, tokenNumber);
        }
        break;
      case 'completed':
        completed += 1;
        if (tokenNumber !== null) {
          highestCompletedToken = highestCompletedToken === null
            ? tokenNumber
            : Math.max(highestCompletedToken, tokenNumber);
        }
        break;
      case 'cancelled':
        cancelled += 1;
        break;
      default:
        waiting += 1;
        break;
    }
  }

  const activeTotal = waiting + inProgress + completed;
  const remaining = Math.max(waiting + inProgress, 0);

  if (activeTotal <= 0) {
    return {
      ...fallbackSummary,
      source: 'derived',
      currentToken: highestCompletedToken ?? fallbackSummary.currentToken,
      total: activeTotal,
      completed,
      remaining,
      progressPct: 0,
      waiting,
      inProgress,
      cancelled,
    };
  }

  const derivedCurrentToken = highestInProgressToken ?? highestCompletedToken ?? fallbackSummary.currentToken;
  const progressPct = clampProgress((completed / activeTotal) * 100);

  return {
    source: 'derived',
    currentToken: derivedCurrentToken,
    total: activeTotal,
    completed,
    remaining,
    progressPct,
    waiting,
    inProgress,
    cancelled,
  };
};
