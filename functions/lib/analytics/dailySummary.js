"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onQueuePatientWrite = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebaseAdmin_1 = require("../firebaseAdmin");
const DAILY_ANALYTICS_ROOT = 'analytics';
const db = firebaseAdmin_1.admin.firestore();
const SAFE_NUMBER = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return 0;
};
const millisecondsToMinutes = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }
    return Math.round(value / 60000);
};
exports.onQueuePatientWrite = (0, firestore_2.onDocumentWritten)('clinics/{clinicId}/doctors/{doctorId}/queues/{queueId}/patients/{patientId}', async (event) => {
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
    const dataRecord = queueData;
    const queueMetrics = dataRecord.metrics;
    const counterFields = ['totalPatients', 'completedPatients', 'cancelledPatients', 'waitingPatients', 'inProgressPatients'];
    const countersAvailable = counterFields.every((field) => typeof dataRecord[field] === 'number');
    const getCounter = (field) => {
        const value = dataRecord[field];
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    };
    let counterSource = 'queue';
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
    const metricsRecord = queueMetrics;
    const serviceTotalsAvailable = typeof metricsRecord?.totalServiceMs === 'number' && typeof metricsRecord?.serviceSamples === 'number' && metricsRecord.serviceSamples > 0;
    const waitTotalsAvailable = typeof metricsRecord?.totalWaitMs === 'number' && typeof metricsRecord?.waitSamples === 'number' && metricsRecord.waitSamples > 0;
    let avgServiceMinutes = null;
    let avgWaitMinutes = null;
    const coerceMetricNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    let serviceSamples = serviceTotalsAvailable ? coerceMetricNumber(metricsRecord?.serviceSamples) : 0;
    let waitSamples = waitTotalsAvailable ? coerceMetricNumber(metricsRecord?.waitSamples) : 0;
    let metricsSource = 'queue';
    if (serviceTotalsAvailable || waitTotalsAvailable) {
        const totalServiceMs = serviceTotalsAvailable ? coerceMetricNumber(metricsRecord?.totalServiceMs) : 0;
        const totalWaitMs = waitTotalsAvailable ? coerceMetricNumber(metricsRecord?.totalWaitMs) : 0;
        avgServiceMinutes = millisecondsToMinutes(serviceSamples > 0 ? totalServiceMs / serviceSamples : null);
        avgWaitMinutes = millisecondsToMinutes(waitSamples > 0 ? totalWaitMs / waitSamples : null);
    }
    else {
        metricsSource = 'patients';
        const completedSnapshot = await patientsColl
            .where('status', '==', 'completed')
            .select('joinedAt', 'service')
            .get();
        let totalServiceDurationMs = 0;
        let totalWaitDurationMs = 0;
        completedSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const service = data.service;
            const joinedAt = data.joinedAt;
            const startedAtMs = typeof service?.startedAt === 'object' && service?.startedAt !== null
                && typeof service.startedAt.toMillis === 'function'
                ? service.startedAt.toMillis()
                : null;
            const completedAtMs = typeof service?.completedAt === 'object' && service?.completedAt !== null
                && typeof service.completedAt.toMillis === 'function'
                ? service.completedAt.toMillis()
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
        avgServiceMinutes = millisecondsToMinutes(serviceSamples > 0 ? totalServiceDurationMs / serviceSamples : null);
        avgWaitMinutes = millisecondsToMinutes(waitSamples > 0 ? totalWaitDurationMs / waitSamples : null);
    }
    const rollingAvgServiceMinutes = millisecondsToMinutes(coerceMetricNumber(metricsRecord?.avgServiceMs));
    const rollingAvgWaitMinutes = millisecondsToMinutes(coerceMetricNumber(metricsRecord?.avgWaitMs));
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
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    const dailyDocRef = db
        .collection(DAILY_ANALYTICS_ROOT)
        .doc(clinicId)
        .collection('doctors')
        .doc(doctorId)
        .collection('daily')
        .doc(queueId);
    await dailyDocRef.set(summary, { merge: true });
});
//# sourceMappingURL=dailySummary.js.map