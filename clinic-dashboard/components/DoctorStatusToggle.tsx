"use client";

import { setDoctorRealTimeStatus } from '@/lib/scheduling';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ClinicDoctorListEntry } from './ClinicContextProvider';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from './ui/alert-dialog';
import { Switch } from './ui/switch';

interface DoctorStatusToggleProps {
  clinicId: string;
  doctorId: string;
  doctorName?: string;
  className?: string;
  showLabel?: boolean;
}

const EMPTY_DOCTOR_LIST: ClinicDoctorListEntry[] = [];

export default function DoctorStatusToggle({ 
  clinicId, 
  doctorId, 
  doctorName = 'Doctor',
  className = '',
  showLabel = true
}: DoctorStatusToggleProps) {
  const queryClient = useQueryClient();
  const doctorsQueryKey = useMemo(() => ['doctors', clinicId ?? ''] as const, [clinicId]);
  const doctorsQuery = useQuery<ClinicDoctorListEntry[]>({
    queryKey: doctorsQueryKey,
    enabled: false,
    queryFn: async () => [],
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

  const doctorList = doctorsQuery.data ?? EMPTY_DOCTOR_LIST;

  const currentDoctor = useMemo(() => {
    if (!doctorId) {
      return null;
    }
    return doctorList.find((entry) => entry.id === doctorId) ?? null;
  }, [doctorId, doctorList]);

  const actualOnline = currentDoctor?.scheduling?.realTimeStatus?.online === true;
  const [optimisticStatus, setOptimisticStatus] = useState<boolean | null>(null);
  const online = optimisticStatus ?? actualOnline;
  const loading = !clinicId || !doctorId || doctorsQuery.data === undefined;
  const [toggling, setToggling] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<boolean | null>(null);

  useEffect(() => {
    if (optimisticStatus === null) {
      return;
    }
    if ((currentDoctor?.scheduling?.realTimeStatus?.online ?? false) === optimisticStatus) {
      setOptimisticStatus(null);
    }
  }, [currentDoctor?.scheduling?.realTimeStatus?.online, optimisticStatus]);

  const handleToggleAttempt = (checked: boolean) => {
    setPendingStatus(checked);
    setShowDialog(true);
  };

  const handleConfirm = async () => {
    if (pendingStatus === null) return;

    setShowDialog(false);
    setToggling(true);

    const targetStatus = pendingStatus;
    const previousDoctors = queryClient.getQueryData<ClinicDoctorListEntry[]>(doctorsQueryKey);

    const applyOptimisticUpdate = (status: boolean) => {
      queryClient.setQueryData<ClinicDoctorListEntry[]>(doctorsQueryKey, (prev) => {
        if (!prev) {
          return prev;
        }
        return prev.map((entry) => {
          if (entry.id !== doctorId) {
            return entry;
          }
          const scheduling = entry.scheduling ?? {};
          const realTimeStatus = scheduling.realTimeStatus ?? {};
          return {
            ...entry,
            scheduling: {
              ...scheduling,
              realTimeStatus: {
                ...realTimeStatus,
                online: status,
              },
            },
          };
        });
      });
    };

    setOptimisticStatus(targetStatus);
    applyOptimisticUpdate(targetStatus);

    try {
      await setDoctorRealTimeStatus({
        clinicId,
        doctorId,
        online: targetStatus,
        source: 'staff'
      });

      toast.success(
        `${doctorName} ${targetStatus ? 'is now online and available' : 'has been marked offline'}`
      );
      queryClient.invalidateQueries({ queryKey: doctorsQueryKey });
    } catch (err) {
      if (previousDoctors) {
        queryClient.setQueryData<ClinicDoctorListEntry[]>(doctorsQueryKey, previousDoctors);
      }
      setOptimisticStatus(null);
      console.error('Failed to update doctor status', err);
      toast.error('Failed to update doctor status. Please try again.');
    } finally {
      setToggling(false);
      setPendingStatus(null);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPendingStatus(null);
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showLabel && <span className="text-sm text-muted-foreground">Loading...</span>}
        <div className="h-5 w-9 bg-muted rounded-full animate-pulse" />
      </div>
    );
  }

  const dotColor = online ? 'bg-green-500' : 'bg-red-500';
  const statusLabel = online ? 'Online' : 'Offline';
  const statusTextColor = online ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <>
      <div className={`flex items-center gap-2.5 ${className}`}>
        {showLabel && (
          <div className="flex items-center gap-2">
            <span className={`relative flex h-2.5 w-2.5`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`}></span>
            </span>
            <span className={`text-sm font-medium ${statusTextColor}`}>{statusLabel}</span>
          </div>
        )}
        {!showLabel && (
          <span className={`relative flex h-2 w-2`}>
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
          </span>
        )}
        {toggling && (
          <svg className="w-4 h-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        <Switch
          checked={online}
          onCheckedChange={handleToggleAttempt}
          disabled={toggling || !clinicId || !doctorId}
          aria-label={`Toggle ${doctorName} online status`}
        />
      </div>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus ? 'Set Doctor Online?' : 'Set Doctor Offline?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus 
                ? `${doctorName} will be marked as online and available for patients to join the queue.`
                : `${doctorName} will be marked as offline. New patients won't be able to join their queue.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {pendingStatus ? 'Set Online' : 'Set Offline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
