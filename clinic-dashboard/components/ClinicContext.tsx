"use client";
import { createContext, useContext } from 'react';
import type { NotificationSettingsDoc } from '../types/settings';

interface QueueContextValue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: 'active' | 'paused' | 'ended';
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  autoAdvance?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface ClinicContextType {
  clinicId: string | null;
  clinicName: string | null;
  doctorId: string | null;
  doctorName: string | null;
  doctorSpecialty: string | null;
  queueStatus: 'active' | 'paused' | 'ended' | undefined;
  queue: QueueContextValue | null;
  notificationSettings: NotificationSettingsDoc | null | undefined;
  reloadNotificationSettings: (() => Promise<void>) | null;
}

const ClinicContext = createContext<ClinicContextType>({
  clinicId: null,
  clinicName: null,
  doctorId: null,
  doctorName: null,
  doctorSpecialty: null,
  queueStatus: undefined,
  queue: null,
  notificationSettings: null,
  reloadNotificationSettings: null,
});

export const useClinicContext = () => useContext(ClinicContext);

export default ClinicContext;
