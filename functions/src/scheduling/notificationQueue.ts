import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';

import { sendNotification } from '../notifier';
import type { ClinicSchedulingSettings, RealTimeStatus } from './types';

const db = admin.firestore();

const notificationsCollection = (clinicId: string, doctorId: string) =>
  db.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId).collection('availabilityNotifications');

const formatPhone = (raw: string): string => {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/[^+\d]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }
    cleaned = `+91${cleaned}`;
  }
  return cleaned;
};

const computeContactKey = (channel: string, phone: string) => {
  const hash = createHash('sha256');
  hash.update(`${channel}::${phone}`);
  return hash.digest('hex');
};

const DEFAULT_CHANNEL = 'whatsapp';

export interface EnqueueNotificationRequest {
  clinicId: string;
  doctorId: string;
  patientName?: string | null;
  phone: string;
  source?: 'patient-app' | 'staff';
  doctorName?: string | null;
}

export interface EnqueueNotificationResult {
  alreadyQueued: boolean;
  status: 'pending' | 'sent';
}

export const enqueueDoctorOnlineNotification = async (
  input: EnqueueNotificationRequest
): Promise<EnqueueNotificationResult> => {
  const clinicId = input.clinicId.trim();
  const doctorId = input.doctorId.trim();
  if (!clinicId || !doctorId) {
    throw new Error('clinicId and doctorId are required');
  }
  if (!input.phone || typeof input.phone !== 'string') {
    throw new Error('phone is required');
  }

  const channel = DEFAULT_CHANNEL;
  const phone = formatPhone(input.phone);
  const contactKey = computeContactKey(channel, phone);

  const colRef = notificationsCollection(clinicId, doctorId);
  const docRef = colRef.doc(contactKey);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const now = FieldValue.serverTimestamp();
    if (snap.exists) {
      const data = snap.data() || {};
      const currentStatus = data.status ?? 'pending';
      tx.set(
        docRef,
        {
          patientName: input.patientName ?? data.patientName ?? null,
          doctorName: input.doctorName ?? data.doctorName ?? null,
          status: 'pending',
          updatedAt: now,
          lastRequestedAt: now,
          requestCount: FieldValue.increment(1)
        },
        { merge: true }
      );
      return { alreadyQueued: currentStatus === 'pending', status: 'pending' as const };
    }

    tx.set(docRef, {
      clinicId,
      doctorId,
      contactKey,
      channel,
      phone,
      patientName: input.patientName ?? null,
  doctorName: input.doctorName ?? null,
      status: 'pending',
      source: input.source ?? 'patient-app',
      createdAt: now,
      updatedAt: now,
      requestCount: 1,
      lastRequestedAt: now
    });
    return { alreadyQueued: false, status: 'pending' as const };
  });

  return result;
};

interface DispatchInput {
  clinicId: string;
  doctorId: string;
  doctorName?: string | null;
}

interface DispatchResult {
  notified: number;
  attempted: number;
}

const MAX_NOTIFICATIONS_PER_DISPATCH = 50;

export const dispatchDoctorOnlineNotifications = async (
  input: DispatchInput
): Promise<DispatchResult> => {
  const { clinicId, doctorId } = input;
  const colRef = notificationsCollection(clinicId, doctorId);
  const query = await colRef
    .where('status', '==', 'pending')
    .orderBy('lastRequestedAt', 'asc')
    .limit(MAX_NOTIFICATIONS_PER_DISPATCH)
    .get();

  if (query.empty) {
    return { notified: 0, attempted: 0 };
  }

  let doctorName = input.doctorName || null;
  if (!doctorName) {
    const doctorSnap = await db.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId).get();
    doctorName = (doctorSnap.data()?.name as string) || 'Doctor';
  }

  let notified = 0;
  let attempted = 0;

  for (const doc of query.docs) {
    attempted += 1;
    const data = doc.data();
    const patientName = data.patientName || 'Patient';
    const phone = data.phone as string;
    const docDoctorName = data.doctorName as string | undefined;
    const messageDoctorName = docDoctorName || doctorName || 'Doctor';

    const result = await sendNotification({
      to: phone,
      type: 'doctor-online',
      payload: {
        name: patientName,
        clinicId,
        doctorId,
        doctorName: messageDoctorName
      }
    });

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      lastAttemptAt: FieldValue.serverTimestamp(),
      attemptCount: FieldValue.increment(1)
    };

    if (result.ok) {
      update.status = 'sent';
      update.notifiedAt = FieldValue.serverTimestamp();
      notified += 1;
    } else {
      update.status = 'pending';
      update.lastError = result.error ?? 'unknown-error';
    }

    await doc.ref.set(update, { merge: true });
  }

  return { notified, attempted };
};

export const shouldEnqueueForStatus = (
  status: RealTimeStatus | null,
  _options?: { settings?: ClinicSchedulingSettings | null }
): boolean => {
  if (!status || status.online === false) {
    return true;
  }

  return false;
};
