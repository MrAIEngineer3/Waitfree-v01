import { FieldValue } from '@google-cloud/firestore';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

type NotifyType = 'joined' | 'three-away' | 'now' | 'cancelled';

interface NotifyOpts {
  to: string; // phone number or identifier
  type: NotifyType;
  payload?: Record<string, any>;
}

// Single exported sendNotification used by functions. Currently logs via functions.logger
// Replace with real provider integration (Twilio, WhatsApp, etc.) using env vars/Secret Manager.
export async function sendNotification(opts: NotifyOpts) {
  try {
    functions.logger.info('Notifier: sending', { to: opts.to, type: opts.type, payload: opts.payload });

    // For local development/emulator: record the notification in a debug collection
    try {
      const db = admin.firestore();
      await db.collection('debugNotifications').add({
        to: opts.to,
        type: opts.type,
        payload: opts.payload || null,
        createdAt: FieldValue.serverTimestamp()
      });
    } catch (e) {
      // If Firestore isn't available or write fails, just log and continue.
      functions.logger.warn('Failed to write debug notification to Firestore', e);
    }

    // No-op provider integration for now.
    return { ok: true };
  } catch (err) {
    functions.logger.error('Notifier failed', err);
    return { ok: false, error: String(err) };
  }
}

// Optional admin helper for programmatic staff claim setting. Keep here so functions can reuse it if needed.
export async function setStaffClaim(uid: string, isStaff: boolean) {
  try {
    await admin.auth().setCustomUserClaims(uid, { staff: isStaff });
    return { success: true };
  } catch (err) {
    functions.logger.error('setStaffClaim error', err);
    throw err;
  }
}

export default { sendNotification, setStaffClaim };
