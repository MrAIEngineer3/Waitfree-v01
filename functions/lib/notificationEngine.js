"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.recomputeQueueNotifications = recomputeQueueNotifications;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const notifier_1 = require("./notifier");
const FALLBACK_SERVICE_MIN_MS = 8 * 60 * 1000; // 8 minutes default
function computeMilestone(status, patientsAhead) {
    if (status === 'in-progress')
        return { milestone: 'now', patientsAhead: 0 };
    if (patientsAhead === 0)
        return { milestone: 'pos1', patientsAhead };
    if (patientsAhead === 1)
        return { milestone: 'pos2', patientsAhead };
    if (patientsAhead === 2)
        return { milestone: 'pos3', patientsAhead };
    return { milestone: null, patientsAhead };
}
function computeEta(patientsAhead, avgServiceMs) {
    const base = avgServiceMs && avgServiceMs > 0 ? avgServiceMs : FALLBACK_SERVICE_MIN_MS;
    // Remaining includes the patient currently being served if they are ahead
    const etaMs = patientsAhead * base;
    return {
        etaMinutes: Math.max(1, Math.round(etaMs / 60000)),
        source: avgServiceMs ? 'ema' : 'fallback',
        avgServiceMinutes: avgServiceMs ? Math.round(avgServiceMs / 60000) : undefined
    };
}
async function recomputeQueueNotifications(params) {
    // Engine permanently enabled (feature flag removed)
    const { clinicId, doctorId, queueId } = params;
    const db = admin.firestore();
    const queueRef = db.collection('clinics').doc(clinicId)
        .collection('doctors').doc(doctorId)
        .collection('queues').doc(queueId);
    const queueSnap = await queueRef.get();
    if (!queueSnap.exists) {
        functions.logger.warn('Queue missing during recompute', params);
        return { skipped: true };
    }
    const qData = queueSnap.data() || {};
    const avgServiceMs = qData?.metrics?.avgServiceMs;
    // Get active patients (waiting + in-progress) ordered by token
    const patientsSnap = await queueRef.collection('patients')
        .where('status', 'in', ['waiting', 'in-progress']);
    // Firestore "in" query cannot orderBy unless index supports it; fallback fetch all then sort client-side
    const activeDocs = (await patientsSnap.get()).docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0));
    // Build list for position calculation
    const inProgressIds = new Set(activeDocs.filter(p => p.status === 'in-progress').map(p => p.id));
    let notificationsSent = 0;
    for (const patient of activeDocs) {
        const ahead = activeDocs.filter(p => (p.tokenNumber || 0) < (patient.tokenNumber || 0) && p.status !== 'cancelled' && p.status !== 'completed').length;
        const { milestone, patientsAhead } = computeMilestone(patient.status, ahead);
        if (!milestone)
            continue;
        // Normalize milestone key mapping to existing notification flags
        const milestoneKey = milestone === 'now' ? 'now' : milestone;
        const existing = patient.notifications || {};
        if (existing[milestoneKey])
            continue; // already sent
        // Transaction to atomically set flag and get patient data for notification
        const patientRef = queueRef.collection('patients').doc(patient.id);
        let notificationData = null;
        try {
            await db.runTransaction(async (tx) => {
                const fresh = await tx.get(patientRef);
                const curData = fresh.data() || {};
                const curFlags = curData.notifications || {};
                if (curFlags[milestoneKey])
                    return; // someone else set it
                const eta = computeEta(patientsAhead, avgServiceMs);
                notificationData = {
                    to: curData.phone || 'unknown',
                    type: milestoneKey,
                    payload: {
                        name: curData.name,
                        tokenNumber: curData.tokenNumber,
                        clinicId, doctorId,
                        queueId,
                        patientsAhead,
                        etaMinutes: eta.etaMinutes,
                        etaSource: eta.source,
                        avgServiceMinutes: eta.avgServiceMinutes || null,
                        milestone: milestoneKey
                    }
                };
                // Only set the flag in the transaction
                tx.set(patientRef, { notifications: { ...curFlags, [milestoneKey]: true } }, { merge: true });
            });
            // Send notification outside the transaction
            if (notificationData) {
                try {
                    await (0, notifier_1.sendNotification)(notificationData);
                    notificationsSent += 1;
                }
                catch (notifyErr) {
                    functions.logger.warn('Failed to send notification after setting flag', {
                        patientId: patient.id,
                        milestone: milestoneKey,
                        err: notifyErr?.message
                    });
                    // Note: Flag was already set, so we won't retry this notification
                    // This prevents infinite retries but ensures we don't send duplicates
                }
            }
        }
        catch (e) {
            functions.logger.warn('Engine failed to process milestone', { patientId: patient.id, err: e?.message });
        }
    }
    functions.logger.info('Notification engine run complete', { clinicId, doctorId, queueId, evaluated: activeDocs.length, sent: notificationsSent });
    return { evaluated: activeDocs.length, sent: notificationsSent };
}
exports.default = { recomputeQueueNotifications };
//# sourceMappingURL=notificationEngine.js.map