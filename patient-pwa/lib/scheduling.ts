import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ClinicSchedulingSettings {
  manualCheckInRequired: boolean;
  allowOfflineSignups: boolean;
}

interface GetClinicSchedulingSettingsResponse {
  clinicId: string;
  settings: Partial<ClinicSchedulingSettings> | null;
}

const defaultSettings: ClinicSchedulingSettings = {
  manualCheckInRequired: false,
  allowOfflineSignups: false,
};

export const fetchClinicSchedulingSettings = async (
  clinicId: string
): Promise<ClinicSchedulingSettings> => {
  const callable = httpsCallable<{ clinicId: string }, GetClinicSchedulingSettingsResponse>(
    functions,
    'getClinicSchedulingSettings'
  );

  const { data } = await callable({ clinicId });
  const raw = data?.settings ?? {};

  return {
    manualCheckInRequired: raw.manualCheckInRequired === true,
    allowOfflineSignups: raw.allowOfflineSignups === true,
  };
};

export const getDefaultClinicSchedulingSettings = (): ClinicSchedulingSettings => ({ ...defaultSettings });
