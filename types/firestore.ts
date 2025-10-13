import { Timestamp } from 'firebase/firestore';

/**
 * WAITFREE SECURE DATA STRUCTURE
 * 
 * This file defines the Firestore data model for the Waitfree queue management system.
 * The structure is designed with privacy and security as primary concerns.
 * 
 * SECURITY ARCHITECTURE:
 * - Public users can read clinic and doctor information for discovery
 * - Public users can read queue metadata (currentToken, status) to check queue progress
 * - Patient data is isolated in protected sub-collections that only staff can access
 * - This prevents patients from seeing other patients' personal information
 * 
 * DATA STRUCTURE:
 * /clinics/{clinicId}                                    [Public Read, Staff Full Access]
 * /clinics/{clinicId}/doctors/{doctorId}                 [Public Read, Staff Full Access]
 * /clinics/{clinicId}/doctors/{doctorId}/queues/{date}   [Public Read Metadata Only, Staff Full Access]
 * /clinics/{clinicId}/doctors/{doctorId}/queues/{date}/patients/{patientId}  [Staff Only]
 */

/**
 * Clinic Interface
 * Represents a clinic document in the 'clinics' collection
 */
export interface Clinic {
  id: string;
  name: string;
  address: string;
  contactNumber: string;
  createdAt: Timestamp;
}

/**
 * Doctor Interface
 * Represents a doctor document in the 'doctors' sub-collection under a clinic
 */
export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  timings: {
    [day: string]: string; // e.g., "monday": "9:00 AM - 5:00 PM"
  };
  clinicId: string;
}

/**
 * Patient Status Type
 * Represents the possible statuses of a patient in the queue
 */
export type PatientStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled';

/**
 * Patient Interface
 * Represents a patient's data within a queue
 */
export interface Patient {
  id: string;
  name: string;
  age: number;
  phone: string; // WhatsApp number
  tokenNumber: number;
  status: PatientStatus;
  joinedAt: Timestamp;
}

/**
 * Queue Status Type
 * Represents the possible statuses of a queue
 */
export type QueueStatus = 'active' | 'paused' | 'ended';

/**
 * Queue Interface
 * Represents a queue document in the 'queues' sub-collection under a doctor
 * Document ID is the date in YYYY-MM-DD format
 * 
 * SECURITY NOTE: This document contains only metadata and is safe for public read access.
 * Patient data is stored in a separate 'patients' sub-collection under each queue document.
 */
export interface Queue {
  id: string; // Date in YYYY-MM-DD format (e.g., "2025-09-23")
  doctorId: string;
  clinicId: string;
  status: QueueStatus;
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  // patients array removed for security - patients are now in a sub-collection
}

export interface NotificationChannelsState {
  whatsapp?: boolean;
  sms?: boolean;
  email?: boolean;
}

export interface NotificationEventsState {
  tokenUpdates?: boolean;
  appointmentReminders?: boolean;
}

export interface NotificationSettingsDoc {
  channels?: NotificationChannelsState;
  events?: NotificationEventsState;
  updatedAt?: Timestamp;
  updatedBy?: string | null;
}

/**
 * Patient Document Interface
 * Represents a patient document in the 'patients' sub-collection under a queue
 * Document ID can be the patient's ID or auto-generated
 * 
 * SECURITY NOTE: This sub-collection is restricted to authenticated users only.
 * Public users cannot list or access individual patient documents.
 */
export interface PatientDocument {
  id: string;
  name: string;
  age: number;
  phone: string; // WhatsApp number
  tokenNumber: number;
  status: PatientStatus;
  joinedAt: Timestamp;
  queueId: string; // Reference to parent queue document
}
