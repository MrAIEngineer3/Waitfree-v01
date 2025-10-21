import type { Timestamp } from 'firebase-admin/firestore';

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const DAY_OF_WEEK_ORDER: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

export interface TimeBlock {
  /** ISO-8601 local start time in HH:mm (24h) */
  start: string;
  /** ISO-8601 local end time in HH:mm (24h) */
  end: string;
  /** Optional human label to display in dashboards */
  label?: string | null;
}

export interface DefaultWeeklyRota {
  /** IANA timezone identifier (e.g. Asia/Kolkata) */
  timeZone: string;
  /** Optional version increment to coordinate client updates */
  version?: number;
  /** Latest update timestamp recorded when rota was saved */
  updatedAt?: Timestamp | null;
  /** Collection of working blocks per weekday */
  week: Partial<Record<DayOfWeek, TimeBlock[]>>;
}

export interface ClinicSchedulingSettings {
  manualCheckInRequired?: boolean;
  allowOfflineSignups?: boolean;
}

export type OverrideType = 'blocker' | 'exception';

export interface ScheduleOverrideBase {
  id: string;
  type: OverrideType;
  /** Inclusive start of the override window (UTC) */
  start: Timestamp;
  /** Exclusive end of the override window (UTC) */
  end: Timestamp;
  /** Optional additional context for audits or UI */
  note?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface BlockerOverride extends ScheduleOverrideBase {
  type: 'blocker';
  /** Optional machine readable reason (e.g. leave, surgery, training) */
  reasonCode?: string | null;
}

export interface ExceptionOverride extends ScheduleOverrideBase {
  type: 'exception';
  /** Optional human label for the additional session */
  label?: string | null;
}

export type ScheduleOverride = BlockerOverride | ExceptionOverride;

export interface RealTimeStatus {
  online: boolean;
  updatedAt: Timestamp;
  /** Optional user-facing note (e.g. stepped out briefly) */
  note?: string | null;
  /** Metadata about who flipped the toggle */
  source?: 'staff' | 'system' | 'automation' | null;
}

export interface DoctorSchedulingDocument {
  realTimeStatus?: RealTimeStatus | null;
  defaultRota?: DefaultWeeklyRota | null;
}

export type ScheduleLayer =
  | 'REALTIME_TOGGLE'
  | 'OVERRIDE_BLOCKER'
  | 'OVERRIDE_EXCEPTION'
  | 'DEFAULT_ROTA'
  | 'NO_SCHEDULE_DATA';

export type AvailabilityReasonCode =
  | 'REALTIME_OFFLINE'
  | 'REALTIME_AVAILABLE'
  | 'BLOCKER'
  | 'EXCEPTION_AVAILABLE'
  | 'DEFAULT_AVAILABLE'
  | 'DEFAULT_OFFLINE'
  | 'NO_SCHEDULE'
  | 'UNKNOWN';

export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface DoctorAvailabilityResult {
  clinicId: string;
  doctorId: string;
  status: AvailabilityStatus;
  layer: ScheduleLayer;
  reasonCode: AvailabilityReasonCode;
  /** UTC instant the resolver executed for traceability */
  computedAt: Date;
  /** Optional projected UTC instant when doctor is next available */
  nextAvailableAt?: Date | null;
  /** Active override that determined the outcome */
  activeOverride?: ScheduleOverride;
  /** Real-time toggle snapshot used in evaluation */
  realTimeStatus?: RealTimeStatus | null;
  /** Optional human-friendly message for client display */
  message?: string;
  /** Extra fields to help debug decisions */
  debug?: Record<string, unknown>;
}

export interface ResolveDoctorAvailabilityInput {
  clinicId: string;
  doctorId: string;
  /** Moment to evaluate availability for (defaults to now) */
  reference?: Date;
  /** Optionally load overrides even if not currently active */
  includeInactiveOverrides?: boolean;
  settings?: ClinicSchedulingSettings;
}

export interface ResolveManyDoctorAvailabilityInput {
  clinicId: string;
  doctorIds: string[];
  reference?: Date;
  settings?: ClinicSchedulingSettings;
}