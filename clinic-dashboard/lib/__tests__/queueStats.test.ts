import type { DashboardQueue, DashboardQueuePatient } from '../hooks/use-dashboard-queue-realtime-bridge';
import { computeQueueSummaryStats } from '../queueStats';

const buildPatient = (overrides: Partial<DashboardQueuePatient>): DashboardQueuePatient => ({
  id: 'patient-1',
  tokenNumber: 1,
  name: 'Test Patient',
  age: 30,
  phone: '000',
  status: 'waiting',
  joinedAt: null,
  queueId: 'queue-1',
  ...overrides,
});

const buildQueue = (overrides: Partial<DashboardQueue> = {}): DashboardQueue => ({
  id: 'queue-1',
  doctorId: 'doctor-1',
  clinicId: 'clinic-1',
  status: 'active',
  currentToken: 3,
  totalPatients: 5,
  completedPatients: 2,
  createdAt: null,
  updatedAt: null,
  autoAdvance: false,
  ...overrides,
});

describe('computeQueueSummaryStats', () => {
  it('falls back to legacy counters when no patients provided', () => {
    const queue = buildQueue();
    const stats = computeQueueSummaryStats({ patients: undefined, queue });

    expect(stats).toMatchObject({
      source: 'legacy',
      total: queue.totalPatients,
      completed: queue.completedPatients,
      remaining: queue.totalPatients - queue.completedPatients,
      progressPct: expect.any(Number),
      currentToken: queue.currentToken,
    });
  });

  it('derives counts from patient statuses', () => {
    const patients: DashboardQueuePatient[] = [
      buildPatient({ id: 'p1', status: 'waiting', tokenNumber: 10 }),
      buildPatient({ id: 'p2', status: 'in-progress', tokenNumber: 11 }),
      buildPatient({ id: 'p3', status: 'completed', tokenNumber: 9 }),
      buildPatient({ id: 'p4', status: 'cancelled', tokenNumber: 12 }),
    ];

    const stats = computeQueueSummaryStats({ patients, queue: buildQueue({ currentToken: 5, totalPatients: 4, completedPatients: 1 }) });

    expect(stats).toMatchObject({
      source: 'derived',
      total: 3,
      completed: 1,
      waiting: 1,
      inProgress: 1,
      cancelled: 1,
      remaining: 2,
      progressPct: 33,
    });
    expect(stats.currentToken).toBe(11);
  });

  it('uses highest completed token when nothing in progress', () => {
    const patients: DashboardQueuePatient[] = [
      buildPatient({ id: 'p1', status: 'completed', tokenNumber: 21 }),
      buildPatient({ id: 'p2', status: 'waiting', tokenNumber: 22 }),
    ];

    const stats = computeQueueSummaryStats({ patients, queue: buildQueue({ currentToken: 5 }) });

    expect(stats.currentToken).toBe(21);
    expect(stats.remaining).toBe(1);
    expect(stats.progressPct).toBe(50);
  });

  it('returns zero totals when no active patients remain', () => {
    const patients: DashboardQueuePatient[] = [
      buildPatient({ id: 'p1', status: 'completed', tokenNumber: 3 }),
      buildPatient({ id: 'p2', status: 'cancelled', tokenNumber: 5 }),
    ];

    const stats = computeQueueSummaryStats({ patients, queue: buildQueue({ currentToken: 2, totalPatients: 5, completedPatients: 2 }) });

    expect(stats).toMatchObject({
      source: 'derived',
      total: 1,
      remaining: 0,
      completed: 1,
      cancelled: 1,
      progressPct: 100,
    });
  });
});
