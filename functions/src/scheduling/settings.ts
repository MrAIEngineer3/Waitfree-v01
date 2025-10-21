import { FieldValue } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import type { ClinicSchedulingSettings } from './types';

const availabilitySettingsRef = (clinicId: string) =>
  admin.firestore().collection('clinics').doc(clinicId).collection('settings').doc('availability');

const normalizeSettings = (raw: admin.firestore.DocumentData | undefined | null): ClinicSchedulingSettings => {
  if (!raw) {
    return {};
  }
  return {
    manualCheckInRequired: raw.manualCheckInRequired === true,
    allowOfflineSignups: raw.allowOfflineSignups === true
  };
};

export const loadClinicSchedulingSettings = async (
  clinicId: string
): Promise<ClinicSchedulingSettings> => {
  if (!clinicId) {
    return {};
  }

  const snap = await availabilitySettingsRef(clinicId).get();
  const settings = normalizeSettings(snap.exists ? snap.data() : undefined);

  return settings;
};

export const saveClinicSchedulingSettings = async (
  clinicId: string,
  input: Partial<ClinicSchedulingSettings>
): Promise<ClinicSchedulingSettings> => {
  if (!clinicId) {
    throw new Error('clinicId is required');
  }

  const ref = availabilitySettingsRef(clinicId);

  const manual = input.manualCheckInRequired === true;
  const allow = manual && input.allowOfflineSignups === true;

  await ref.set(
    {
      manualCheckInRequired: manual,
      allowOfflineSignups: allow,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    manualCheckInRequired: manual,
    allowOfflineSignups: allow
  };
};
