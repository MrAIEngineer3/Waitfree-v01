"use client";
import { createContext, useContext } from 'react';

interface ClinicContextType {
  clinicId: string | null;
  clinicName: string | null;
  doctorName: string | null;
  doctorSpecialty: string | null;
  queueStatus: 'active' | 'paused' | 'ended' | undefined;
}

const ClinicContext = createContext<ClinicContextType>({
  clinicId: null,
  clinicName: null,
  doctorName: null,
  doctorSpecialty: null,
  queueStatus: undefined,
});

export const useClinicContext = () => useContext(ClinicContext);

export default ClinicContext;
