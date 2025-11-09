"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeHistoricalQueuePatients = void 0;
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebaseAdmin_1 = require("../firebaseAdmin");
const DEFAULT_RETENTION_DAYS = 90;
const MAX_QUEUE_BATCH = 25;
const MAX_PATIENTS_PER_BATCH = 400;
const db = firebaseAdmin_1.admin.firestore();
const chunk = (items, size) => {
    if (size <= 0) {
        return [items];
    }
    const result = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
};
exports.purgeHistoricalQueuePatients = (0, scheduler_1.onSchedule)({
    schedule: 'every 24 hours',
    timeZone: 'UTC',
}, async () => {
    const retentionDaysEnv = process.env.QUEUE_PATIENT_RETENTION_DAYS;
    const retentionDays = retentionDaysEnv ? Number(retentionDaysEnv) : DEFAULT_RETENTION_DAYS;
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
        return;
    }
    const cutoff = firestore_1.Timestamp.fromMillis(Date.now() - retentionDays * 86400000);
    const queueSnapshots = await db
        .collectionGroup('queues')
        .where('createdAt', '<', cutoff)
        .limit(MAX_QUEUE_BATCH)
        .get();
    if (queueSnapshots.empty) {
        return;
    }
    for (const queueDoc of queueSnapshots.docs) {
        const queueData = queueDoc.data() ?? {};
        const scrubbedAt = queueData.scrubbedAt;
        if (scrubbedAt && scrubbedAt.toMillis() > cutoff.toMillis()) {
            continue;
        }
        let fetched = 0;
        // Loop until all patients removed or until MAX_PATIENTS_PER_BATCH reached.
        while (fetched < MAX_PATIENTS_PER_BATCH) {
            const patientsSnapshot = await queueDoc.ref
                .collection('patients')
                .limit(200)
                .get();
            if (patientsSnapshot.empty) {
                break;
            }
            const patientChunks = chunk(patientsSnapshot.docs, 100);
            for (const docs of patientChunks) {
                const batch = db.batch();
                docs.forEach((docSnap) => {
                    batch.delete(docSnap.ref);
                });
                fetched += docs.length;
                await batch.commit();
            }
            if (patientsSnapshot.size < 200) {
                break;
            }
        }
        await queueDoc.ref.set({
            scrubbedAt: firestore_1.Timestamp.now(),
            scrubMetadata: {
                retentionDays,
                removedPatients: fetched,
                cutoff: cutoff,
            },
        }, { merge: true });
    }
});
//# sourceMappingURL=retention.js.map