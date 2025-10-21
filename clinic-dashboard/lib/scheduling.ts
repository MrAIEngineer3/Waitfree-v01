import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface TimeBlockDefinition {
  start: string;
  end: string;
  label?: string | null;
}

export interface UpdateDoctorDefaultRotaPayload {
  clinicId: string;
  doctorId: string;
  timeZone: string;
  week: Record<string, TimeBlockDefinition[]>;
}

export interface UpdateDoctorDefaultRotaResponse {
  success: boolean;
  rota: {
    timeZone: string;
    week: Record<string, TimeBlockDefinition[]>;
    version?: number;
    updatedAt?: unknown;
  };
}

export interface SetDoctorRealTimeStatusRequest {
  clinicId: string;
  doctorId: string;
  online: boolean;
  note?: string | null;
  source?: 'staff' | 'system' | 'automation' | null;
}

export interface CallableRealTimeStatusSnapshot {
  online: boolean;
  note?: string | null;
  source?: string | null;
  updatedAt?: unknown;
}

export interface SetDoctorRealTimeStatusResponse {
  success: boolean;
  changed: boolean;
  previousStatus?: CallableRealTimeStatusSnapshot | null;
  updatedStatus?: CallableRealTimeStatusSnapshot | null;
  effectiveAt?: string;
}

export const updateDoctorDefaultRota = async (payload: UpdateDoctorDefaultRotaPayload) => {
  const callable = httpsCallable<UpdateDoctorDefaultRotaPayload, UpdateDoctorDefaultRotaResponse>(
    functions,
    'updateDoctorDefaultRota'
  );

  const { data } = await callable(payload);
  return data;
};

export interface ClinicSchedulingSettings {
  manualCheckInRequired: boolean;
  allowOfflineSignups: boolean;
}

interface GetClinicSchedulingSettingsResponse {
  clinicId: string;
  settings: Partial<ClinicSchedulingSettings>;
}

interface GetClinicSchedulingSettingsRequest {
  clinicId: string;
}

interface UpdateClinicSchedulingSettingsRequest extends ClinicSchedulingSettings {
  clinicId: string;
}

interface UpdateClinicSchedulingSettingsResponse {
  clinicId: string;
  settings: ClinicSchedulingSettings;
}

const defaultClinicSchedulingSettings: ClinicSchedulingSettings = {
  manualCheckInRequired: false,
  allowOfflineSignups: false
};

export const fetchClinicSchedulingSettings = async (clinicId: string): Promise<ClinicSchedulingSettings> => {
  const callable = httpsCallable<GetClinicSchedulingSettingsRequest, GetClinicSchedulingSettingsResponse>(
    functions,
    'getClinicSchedulingSettings'
  );

  const { data } = await callable({ clinicId });
  const raw = data?.settings ?? {};
  return {
    manualCheckInRequired: raw.manualCheckInRequired === true,
    allowOfflineSignups: raw.allowOfflineSignups === true
  };
};

export const updateClinicSchedulingSettings = async (
  clinicId: string,
  settings: ClinicSchedulingSettings
): Promise<ClinicSchedulingSettings> => {
  const callable = httpsCallable<UpdateClinicSchedulingSettingsRequest, UpdateClinicSchedulingSettingsResponse>(
    functions,
    'updateClinicSchedulingSettings'
  );

  const { data } = await callable({ clinicId, ...settings });
  if (!data?.settings) {
    return defaultClinicSchedulingSettings;
  }
  return {
    manualCheckInRequired: data.settings.manualCheckInRequired === true,
    allowOfflineSignups: data.settings.allowOfflineSignups === true
  };
};

export const setDoctorRealTimeStatus = async (
  payload: SetDoctorRealTimeStatusRequest
): Promise<SetDoctorRealTimeStatusResponse> => {
  const callable = httpsCallable<
    SetDoctorRealTimeStatusRequest,
    SetDoctorRealTimeStatusResponse
  >(functions, 'setDoctorRealTimeStatus');

  const { data } = await callable(payload);
  return data;
};
