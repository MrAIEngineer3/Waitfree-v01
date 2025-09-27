"use client";

import { doc, onSnapshot } from 'firebase/firestore'; // getDoc retained temporarily if needed elsewhere
import { useEffect, useState } from 'react';
import AccountBadge from '../components/AccountBadge';
import QueueList from '../components/QueueList';
import QueueMetrics from '../components/QueueMetrics';
import StatsCards from '../components/StatsCards';
import { auth, db } from '../lib/firebase';

import { onAuthStateChanged } from 'firebase/auth';

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinicId: string;
  email?: string;
  phone?: string;
  createdAt?: Date | { seconds: number; nanoseconds: number };
}

interface Queue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: 'active' | 'paused' | 'ended';
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  createdAt?: Date | { seconds: number; nanoseconds: number };
  updatedAt?: Date | { seconds: number; nanoseconds: number };
}

export default function Dashboard() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [clinicName, setClinicName] = useState<string | null>(null);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

  // Keep references to any active snapshot unsubscribers so we can cleanup when auth changes
  let unsubscribeDoctor: (() => void) | null = null;
  let unsubscribeQueue: (() => void) | null = null;
  // Listener for users/{uid} mapping so we react when the mapping is created/updated after sign-in
  let unsubscribeUserDoc: (() => void) | null = null;

  // Watch auth and map to clinic/doctor via users/{uid}
  const unsubAuth = onAuthStateChanged(auth, async (user) => {
      // Cleanup any previous listeners
      try {
        if (unsubscribeDoctor) unsubscribeDoctor();
      } catch (_ignored) {}
      try {
        if (unsubscribeQueue) unsubscribeQueue();
      } catch (_ignored) {}

      // Clean up any previous user listener, then proceed
      try { if (unsubscribeUserDoc) unsubscribeUserDoc(); } catch (err) { void err; }

      // If no user is signed in, clear mapping and avoid creating any LIST/subscriptions.
      if (!user) {
        setClinicId(null);
        setDoctorId(null);
        setDoctor(null);
        setQueue(null);
        setAuthReady(true);
        return;
      }

      // Listen to the users/{uid} doc in real-time. This ensures that if the demo helper
      // writes the clinicId/doctorId after sign-in, the dashboard will pick it up and
      // subscribe to the doctor and queue documents.
      const userRef = doc(db, 'users', user.uid);
  // Debounce timer id for delayed subscription
  let subscribeTimer: ReturnType<typeof setTimeout> | null = null;

  unsubscribeUserDoc = onSnapshot(userRef, (snap) => {
        let cId: string | null = null;
        let dId: string | null = null;
        if (snap.exists()) {
          const data = snap.data() as { clinicId?: string; doctorId?: string } | undefined;
          if (data?.clinicId) cId = data.clinicId ?? null;
          if (data?.doctorId) dId = data.doctorId ?? null;
        }

        // Set mapping state
        setClinicId(cId);
        setDoctorId(dId);
        setAuthReady(true);

        // If mapping is incomplete, clean up and wait for mapping to appear
        if (!cId || !dId) {
          try { if (unsubscribeDoctor) { unsubscribeDoctor(); unsubscribeDoctor = null; } } catch (err) { void err; }
          try { if (unsubscribeQueue) { unsubscribeQueue(); unsubscribeQueue = null; } } catch (err) { void err; }
          setDoctor(null);
          setQueue(null);
          setClinicName(null);
          return;
        }

        // If mapping exists, subscribe to doctor & queue (only re-subscribe if needed)
        const today = new Date().toISOString().split('T')[0];
        const queueId = today;
        const doctorRef = doc(db, 'clinics', cId, 'doctors', dId);
        const queueRef = doc(db, 'clinics', cId, 'doctors', dId, 'queues', queueId);
        // Real-time clinic subscription
        const clinicRef = doc(db, 'clinics', cId);
        const unsubscribeClinic = onSnapshot(clinicRef, snap => {
          if (snap.exists()) {
            const data = snap.data() as { name?: string };
            setClinicName(data?.name ?? null);
          } else {
            setClinicName(null);
          }
        }, err => {
          console.warn('Clinic onSnapshot error', err);
          setClinicName(null);
        });

        // Debounce subscription slightly to avoid rapid onSnapshot watch races that
        // can lead to Firestore internal assertion failures in some emulator/client combos.
        if (subscribeTimer) {
          clearTimeout(subscribeTimer);
        }
        subscribeTimer = setTimeout(() => {
          // Only re-subscribe if we don't already have subscriptions for this mapping
          const alreadySubscribed = unsubscribeDoctor != null && unsubscribeQueue != null;
          if (!alreadySubscribed) {
            unsubscribeDoctor = onSnapshot(doctorRef, (snapshot) => {
              if (snapshot.exists()) {
                const doctorData = { id: snapshot.id, ...snapshot.data() } as Doctor;
                setDoctor(doctorData);
              } else {
                setDoctor(null);
              }
            }, (error) => {
              console.error('Error fetching doctor data:', error);
            });

            unsubscribeQueue = onSnapshot(queueRef, (snapshot) => {
              if (snapshot.exists()) {
                const queueData = { id: snapshot.id, ...snapshot.data() } as Queue;
                setQueue(queueData);
              } else {
                setQueue(null);
              }
            }, (error) => {
              console.error('Error fetching queue data:', error);
            });
          }
        }, 200);

        // Ensure clinic unsub on mapping change
        return () => {
          try { unsubscribeClinic(); } catch (_e) { /* ignore */ }
        };
      }, (error) => {
        console.error('Error listening to user mapping:', error);
      });
    });

    return () => {
      try { unsubAuth(); } catch (err) { void err; }
      try { if (unsubscribeDoctor) unsubscribeDoctor(); } catch (err) { void err; }
      try { if (unsubscribeQueue) unsubscribeQueue(); } catch (err) { void err; }
    };
  }, []);

  const getQueueStatusBadge = (status: Queue['status'] | undefined) => {
    if (!status) return null;
    
    const statusConfig = {
      active: { color: 'bg-green-600 text-green-100', text: 'Active' },
      paused: { color: 'bg-yellow-600 text-yellow-100', text: 'Paused' },
      ended: { color: 'bg-red-600 text-red-100', text: 'Ended' }
    };

    const config = statusConfig[status];
    
    return (
      <span className={`ml-3 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  return (
    <div className="space-y-10">
      {/* Top summary banner: only show after doctor doc is actually loaded. */}
      {(doctor || clinicName) && (
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100 p-6 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none select-none opacity-[0.07] bg-[radial-gradient(circle_at_20%_20%,#2563eb,transparent_60%)]" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="space-y-2">
              {clinicName && (
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" /></svg>
                  <span className="text-base lg:text-lg tracking-tight">{clinicName}</span>
                </div>
              )}
              {doctor && (
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-3">
                    {doctor.name}
                    {getQueueStatusBadge(queue?.status)}
                  </h1>
                  {doctor.specialty && (
                    <p className="mt-1 text-sm text-gray-600">{doctor.specialty}</p>
                  )}
                </div>
              )}
            </div>
            {queue && (
              <div className="flex-shrink-0"><QueueMetrics currentToken={queue.currentToken} completedPatients={queue.completedPatients} totalPatients={queue.totalPatients} status={queue.status} /></div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Queue + Auth column */}
        <div className="xl:col-span-2 space-y-8">
          <div className="rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-800">Queue Management</h2>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Live
              </div>
            </div>
            <div className="mb-4"><AccountBadge /></div>
            {clinicId && doctorId && (
              <QueueList clinicId={clinicId} doctorId={doctorId} queueStatus={queue?.status} />
            )}
            {(!clinicId || !doctorId) && authReady && (
              <div className="p-4 text-sm text-gray-600">
                {(!clinicId || !doctorId) ? 'Waiting for account to attach a clinic/doctor mapping. Create a demo account or add clinicId/doctorId to your user doc.' : 'Loading...'}
              </div>
            )}
          </div>
        </div>

        {/* Analytics / Stats */}
        <div className="space-y-8">
          <div className="rounded-xl border border-gray-200 bg-white/60 backdrop-blur-sm p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Clinic Statistics</h2>
            <StatsCards clinicId={clinicId ?? undefined} doctorId={doctorId ?? undefined} />
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Doctor Management</h3>
              <p className="text-gray-600 text-xs leading-relaxed">Scheduling and management tools will appear here as the platform evolves.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
