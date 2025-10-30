import * as functions from 'firebase-functions/v1';
import { sendNotification } from './notifier';
import { admin } from './firebaseAdmin';
import { isNotificationEnabled } from './settings/notificationPreferences';

/**
 * Notification Engine (Phase 2)
 * Recomputes top 3 waiting + in-progress milestone notifications with ETA.
 * Always ON now – legacy NEW_NOTIFICATION_ENGINE flag removed.
 */

interface EtaResult { etaMinutes: number; source: 'ema' | 'fallback'; avgServiceMinutes?: number }
interface MilestoneInfo { milestone: 'pos3' | 'pos2' | 'pos1' | 'now' | null; patientsAhead: number }

const FALLBACK_SERVICE_MIN_MS = 8 * 60 * 1000; // 8 minutes default

function computeMilestone(status: string, patientsAhead: number): MilestoneInfo {
  if (status === 'in-progress') return { milestone: 'now', patientsAhead: 0 };
  if (patientsAhead === 0) return { milestone: 'pos1', patientsAhead };
  if (patientsAhead === 1) return { milestone: 'pos2', patientsAhead };
  if (patientsAhead === 2) return { milestone: 'pos3', patientsAhead };
  return { milestone: null, patientsAhead };
}

function computeEta(patientsAhead: number, avgServiceMs?: number): EtaResult {
  const base = avgServiceMs && avgServiceMs > 0 ? avgServiceMs : FALLBACK_SERVICE_MIN_MS;
  // Remaining includes the patient currently being served if they are ahead
  const etaMs = patientsAhead * base;
  return {
    etaMinutes: Math.max(1, Math.round(etaMs / 60000)),
    source: avgServiceMs ? 'ema' : 'fallback',
    avgServiceMinutes: avgServiceMs ? Math.round(avgServiceMs / 60000) : undefined
  };
}

export async function recomputeQueueNotifications(params: { clinicId: string; doctorId: string; queueId: string }) {
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

  const tokenUpdatesAllowed = await isNotificationEnabled({
    clinicId,
    channel: 'whatsapp',
    event: 'tokenUpdates'
  });

  if (!tokenUpdatesAllowed) {
    functions.logger.info('Notification preferences disabled token updates; skipping queue recompute notifications', {
      clinicId,
      doctorId,
      queueId
    });
    return { skipped: true, reason: 'token-updates-disabled' };
  }
  const qData: any = queueSnap.data() || {};
  const avgServiceMs: number | undefined = qData?.metrics?.avgServiceMs;

  // Get active patients (waiting + in-progress) ordered by token
  const patientsSnap = await queueRef.collection('patients')
    .where('status', 'in', ['waiting', 'in-progress']) as admin.firestore.Query<admin.firestore.DocumentData>;
  // Firestore "in" query cannot orderBy unless index supports it; fallback fetch all then sort client-side
  const activeDocs = (await patientsSnap.get()).docs
    .map(d => ({ id: d.id, ...d.data() as any }))
    .sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0));

  // Build list for position calculation
  // const inProgressIds = new Set(activeDocs.filter(p => p.status === 'in-progress').map(p => p.id));

  let notificationsSent = 0;
  for (const patient of activeDocs) {
    const ahead = activeDocs.filter(p => (p.tokenNumber || 0) < (patient.tokenNumber || 0) && p.status !== 'cancelled' && p.status !== 'completed').length;
    const { milestone, patientsAhead } = computeMilestone(patient.status, ahead);
    if (!milestone) continue;

    // Normalize milestone key mapping to existing notification flags
    const milestoneKey = milestone === 'now' ? 'now' : milestone;
    const existing = patient.notifications || {};

    if (existing[milestoneKey]) continue; // already sent

    // Transaction to atomically set flag and get patient data for notification
    const patientRef = queueRef.collection('patients').doc(patient.id);
    let notificationData: any = null;
    
    try {
      await db.runTransaction(async tx => {
        const fresh = await tx.get(patientRef);
        const curData: any = fresh.data() || {};
        const curFlags = curData.notifications || {};
        if (curFlags[milestoneKey]) return; // someone else set it

        const eta = computeEta(patientsAhead, avgServiceMs);
        notificationData = {
          to: curData.phone || 'unknown',
          type: milestoneKey as any,
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
          await sendNotification(notificationData);
          notificationsSent += 1;
        } catch (notifyErr) {
          functions.logger.warn('Failed to send notification after setting flag', { 
            patientId: patient.id, 
            milestone: milestoneKey,
            err: (notifyErr as any)?.message 
          });
          // Note: Flag was already set, so we won't retry this notification
          // This prevents infinite retries but ensures we don't send duplicates
        }
      }
    } catch (e) {
      functions.logger.warn('Engine failed to process milestone', { patientId: patient.id, err: (e as any)?.message });
    }
  }

  functions.logger.info('Notification engine run complete', { clinicId, doctorId, queueId, evaluated: activeDocs.length, sent: notificationsSent });
  return { evaluated: activeDocs.length, sent: notificationsSent };
}

export default { recomputeQueueNotifications };
