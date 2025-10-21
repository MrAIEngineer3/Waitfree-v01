import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type DoctorAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface AvailabilityOverride {
  id: string;
  type: 'blocker' | 'exception';
  start: string;
  end: string;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  reasonCode?: string | null;
  label?: string | null;
}

export interface RealTimeStatusInfo {
  online: boolean;
  note: string | null;
  source: string | null;
  updatedAt: string | null;
}

export interface DoctorAvailabilityPayload {
  status: DoctorAvailabilityStatus;
  layer: string;
  reasonCode: string;
  message: string | null;
  computedAt: string;
  nextAvailableAt: string | null;
  activeOverride: AvailabilityOverride | null;
  realTimeStatus: RealTimeStatusInfo | null;
  debug?: Record<string, unknown> | null;
}

export interface DoctorProfileSummary {
  name: string | null;
  specialty: string | null;
  avatarUrl: string | null;
}

export interface ClinicDoctorAvailabilityEntry {
  doctorId: string;
  profile: DoctorProfileSummary | null;
  availability: DoctorAvailabilityPayload;
}

export interface ClinicDoctorAvailabilityResponse {
  clinicId: string;
  count: number;
  doctors: ClinicDoctorAvailabilityEntry[];
  requestedDoctorIds?: string[];
}

export const getClinicDoctorAvailability = async (
  clinicId: string,
  doctorIds?: string[]
): Promise<ClinicDoctorAvailabilityResponse> => {
  const callable = httpsCallable<
    { clinicId: string; doctorIds?: string[] },
    ClinicDoctorAvailabilityResponse
  >(functions, 'getClinicDoctorAvailability');

  const { data } = await callable({ clinicId, doctorIds });
  return data;
};
