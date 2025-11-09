import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { admin } from '../firebaseAdmin';

const DAILY_ANALYTICS_ROOT = 'analytics';

const db = admin.firestore();

const SAFE_NUMBER = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
};

const millisecondsToMinutes = (value: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value / 60000);
};

export const onQueuePatientWrite = onDocumentWritten(
  'clinics/{clinicId}/doctors/{doctorId}/queues/{queueId}/patients/{patientId}',
  async (event) => {
    const { clinicId, doctorId, queueId } = event.params;

    if (!clinicId || !doctorId || !queueId) {
      return;
    }

    const queueRef = db
      .collection('clinics')
      .doc(clinicId)
      .collection('doctors')
      .doc(doctorId)
      .collection('queues')
      .doc(queueId);

    const queueSnap = await queueRef.get();
    const queueData = queueSnap.exists ? queueSnap.data() ?? {} : {};
    const dataRecord = queueData as Record<string, unknown>;
    const queueMetrics = dataRecord.metrics as Record<string, unknown> | undefined;

    const counterFields = ['totalPatients', 'completedPatients', 'cancelledPatients', 'waitingPatients', 'inProgressPatients'] as const;
    type CounterField = typeof counterFields[number];

    const countersAvailable = counterFields.every((field) => typeof dataRecord[field] === 'number');
    const getCounter = (field: CounterField): number => {
      const value = dataRecord[field];
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    };

    let counterSource: 'queue' | 'patients' = 'queue';
    let totalPatients = getCounter('totalPatients');
    let completedPatients = getCounter('completedPatients');
    let cancelledPatients = getCounter('cancelledPatients');
    let waitingPatients = getCounter('waitingPatients');
    let inProgressPatients = getCounter('inProgressPatients');

    const patientsColl = queueRef.collection('patients');
    if (!countersAvailable) {
      counterSource = 'patients';
      const [totalAgg, completedAgg, cancelledAgg, waitingAgg, inProgressAgg] = await Promise.all([
        patientsColl.count().get(),
        patientsColl.where('status', '==', 'completed').count().get(),
        patientsColl.where('status', '==', 'cancelled').count().get(),
        patientsColl.where('status', '==', 'waiting').count().get(),
        patientsColl.where('status', '==', 'in-progress').count().get(),
      ]);

      totalPatients = totalAgg.data().count ?? 0;
      completedPatients = completedAgg.data().count ?? 0;
      cancelledPatients = cancelledAgg.data().count ?? 0;
      waitingPatients = waitingAgg.data().count ?? 0;
      inProgressPatients = inProgressAgg.data().count ?? 0;
    }

    const metricsRecord = queueMetrics as Record<string, unknown> | undefined;
    const serviceTotalsAvailable = typeof metricsRecord?.totalServiceMs === 'number' && typeof metricsRecord?.serviceSamples === 'number' && (metricsRecord.serviceSamples as number) > 0;
    const waitTotalsAvailable = typeof metricsRecord?.totalWaitMs === 'number' && typeof metricsRecord?.waitSamples === 'number' && (metricsRecord.waitSamples as number) > 0;

    let avgServiceMinutes: number | null = null;
    let avgWaitMinutes: number | null = null;
    const coerceMetricNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    let serviceSamples = serviceTotalsAvailable ? coerceMetricNumber(metricsRecord?.serviceSamples) : 0;
    let waitSamples = waitTotalsAvailable ? coerceMetricNumber(metricsRecord?.waitSamples) : 0;
    let metricsSource: 'queue' | 'patients' = 'queue';

    if (serviceTotalsAvailable || waitTotalsAvailable) {
      const totalServiceMs = serviceTotalsAvailable ? coerceMetricNumber(metricsRecord?.totalServiceMs) : 0;
      const totalWaitMs = waitTotalsAvailable ? coerceMetricNumber(metricsRecord?.totalWaitMs) : 0;
      avgServiceMinutes = millisecondsToMinutes(serviceSamples > 0 ? totalServiceMs / serviceSamples : null);
      avgWaitMinutes = millisecondsToMinutes(waitSamples > 0 ? totalWaitMs / waitSamples : null);
    } else {
      metricsSource = 'patients';
      const completedSnapshot = await patientsColl
        .where('status', '==', 'completed')
        .select('joinedAt', 'service')
        .get();

      let totalServiceDurationMs = 0;
      let totalWaitDurationMs = 0;

      completedSnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const service = data.service as Record<string, unknown> | undefined;
        const joinedAt = data.joinedAt as { toMillis?: () => number } | undefined;

        const startedAtMs = typeof service?.startedAt === 'object' && service?.startedAt !== null
          && typeof (service.startedAt as { toMillis?: () => number }).toMillis === 'function'
          ? (service.startedAt as { toMillis: () => number }).toMillis()
          : null;

        const completedAtMs = typeof service?.completedAt === 'object' && service?.completedAt !== null
          && typeof (service.completedAt as { toMillis?: () => number }).toMillis === 'function'
          ? (service.completedAt as { toMillis: () => number }).toMillis()
          : null;

        const joinedAtMs = typeof joinedAt?.toMillis === 'function' ? joinedAt.toMillis() : null;

        if (completedAtMs && startedAtMs && completedAtMs > startedAtMs) {
          totalServiceDurationMs += completedAtMs - startedAtMs;
          serviceSamples += 1;
        }

        if (startedAtMs && joinedAtMs && startedAtMs > joinedAtMs) {
          totalWaitDurationMs += startedAtMs - joinedAtMs;
          waitSamples += 1;
        }
      });

      avgServiceMinutes = millisecondsToMinutes(
        serviceSamples > 0 ? totalServiceDurationMs / serviceSamples : null
      );
      avgWaitMinutes = millisecondsToMinutes(
        waitSamples > 0 ? totalWaitDurationMs / waitSamples : null
      );
    }

    const rollingAvgServiceMinutes = millisecondsToMinutes(
      coerceMetricNumber(metricsRecord?.avgServiceMs)
    );
    const rollingAvgWaitMinutes = millisecondsToMinutes(
      coerceMetricNumber(metricsRecord?.avgWaitMs)
    );

    const summary = {
      clinicId,
      doctorId,
      queueId,
      totalPatients,
      completedPatients,
      cancelledPatients,
      waitingPatients,
      inProgressPatients,
      serviceSamples,
      waitSamples,
      avgServiceMinutes,
      avgWaitMinutes,
      rollingAvgServiceMinutes,
      rollingAvgWaitMinutes,
      counterSource,
      metricsSource,
      aggregationVersion: 2,
      updatedAt: FieldValue.serverTimestamp(),
    } satisfies Record<string, unknown>;

    const dailyDocRef = db
      .collection(DAILY_ANALYTICS_ROOT)
      .doc(clinicId)
      .collection('doctors')
      .doc(doctorId)
      .collection('daily')
      .doc(queueId);

    await dailyDocRef.set(summary, { merge: true });
  }
);
