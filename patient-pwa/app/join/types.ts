import type { ClinicSummary, DoctorAvailabilityPayload } from '@/lib/availability';

export type DoctorListEntry = {
  id: string;
  name?: string | null;
  specialty?: string | null;
  availability?: DoctorAvailabilityPayload | null;
};

export type DoctorAvailabilitySnapshot = {
  doctors: DoctorListEntry[];
  availabilityByDoctor: Record<string, DoctorAvailabilityPayload>;
  doctorsLoading: boolean;
  availabilityError: string | null;
  clinic: ClinicSummary | null;
};
