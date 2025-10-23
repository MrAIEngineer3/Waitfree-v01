"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Switch } from './ui/switch';
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
import { setDoctorRealTimeStatus } from '@/lib/scheduling';
import { toast } from 'sonner';

interface DoctorStatusToggleProps {
  clinicId: string;
  doctorId: string;
  doctorName?: string;
  className?: string;
  showLabel?: boolean;
}

interface SchedulingDocument {
  realTimeStatus?: {
    online?: boolean;
    updatedAt?: unknown;
    note?: string | null;
    source?: string | null;
  } | null;
}

export default function DoctorStatusToggle({ 
  clinicId, 
  doctorId, 
  doctorName = 'Doctor',
  className = '',
  showLabel = true
}: DoctorStatusToggleProps) {
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<boolean | null>(null);

  useEffect(() => {
    if (!clinicId || !doctorId) {
      setLoading(false);
      return;
    }

    // Listen to the doctor document which includes scheduling data
    const doctorRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);
    
    const unsubscribe = onSnapshot(
      doctorRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // The scheduling data should be embedded in the doctor document
          const scheduling = data?.scheduling as SchedulingDocument | undefined;
          setOnline(scheduling?.realTimeStatus?.online === true);
        } else {
          setOnline(false);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Failed to subscribe to doctor status', error);
        setOnline(false);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clinicId, doctorId]);

  const handleToggleAttempt = (checked: boolean) => {
    setPendingStatus(checked);
    setShowDialog(true);
  };

  const handleConfirm = async () => {
    if (pendingStatus === null) return;

    setShowDialog(false);
    setToggling(true);

    try {
      await setDoctorRealTimeStatus({
        clinicId,
        doctorId,
        online: pendingStatus,
        source: 'staff'
      });

      toast.success(
        `${doctorName} ${pendingStatus ? 'is now online and available' : 'has been marked offline'}`
      );
    } catch (err) {
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

  const statusColor = online ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-muted-foreground/30';
  const statusLabel = online ? 'Online' : 'Offline';

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {showLabel && (
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
            <span className="text-sm font-medium text-foreground">{statusLabel}</span>
          </div>
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
