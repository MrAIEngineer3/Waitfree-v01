'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import Sparkline from './ui/Sparkline';

interface Queue {
  id: string;
  doctorId: string;
  clinicId: string;
  status: string;
  currentToken: number;
  totalPatients: number;
  completedPatients: number;
  createdAt: Date | { seconds: number; nanoseconds: number };
  updatedAt?: Date | { seconds: number; nanoseconds: number };
}

export interface StatsCardsProps {
  clinicId?: string;
  doctorId?: string;
}

export default function StatsCards({ clinicId: clinicIdProp, doctorId: doctorIdProp }: StatsCardsProps) {
  const [queue, setQueue] = useState<Queue | null>(null);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    // If no mapping is provided (user not signed in), do not subscribe to avoid rule denials
    if (!clinicIdProp || !doctorIdProp) {
      setQueue(null);
      return;
    }

    const clinicId = clinicIdProp;
    const doctorId = doctorIdProp;
    const today = new Date().toISOString().split('T')[0];
    const queueId = today;

    // Create reference to the queue document
    const queueRef = doc(
      db,
      'clinics',
      clinicId,
      'doctors',
      doctorId,
      'queues',
      queueId
    );

    // Set up real-time listener for the queue document
    const unsubscribe = onSnapshot(queueRef, (snapshot) => {
      if (snapshot.exists()) {
        const queueData = {
          id: snapshot.id,
          ...snapshot.data()
        } as Queue;
        setQueue(queueData);
      } else {
        // Queue document doesn't exist yet for today
        setQueue(null);
      }
    }, (error) => {
      console.error('Error fetching queue data:', error);
    });

    // Cleanup function
    return () => unsubscribe();
  }, [clinicIdProp, doctorIdProp]);

  const stats = [
    {
      label: 'Current Token',
      value: queue?.currentToken || 0,
      color: 'text-blue-600',
      trend: (() => {
        const v = queue?.currentToken || 0;
        return [Math.max(0, v - 4), Math.max(0, v - 2), v - 1, v];
      })()
    },
    {
      label: 'Total Patients',
      value: queue?.totalPatients || 0,
      color: 'text-yellow-600',
      trend: (() => {
        const v = queue?.totalPatients || 0;
        return [v - 3, v - 2, v - 1, v].map(n => Math.max(0, n));
      })()
    },
    {
      label: 'Completed',
      value: queue?.completedPatients || 0,
      color: 'text-green-600',
      trend: (() => {
        const v = queue?.completedPatients || 0;
        return [v - 3, v - 1, v - 1, v].map(n => Math.max(0, n));
      })()
    }
  ];

  return (
    <div className="space-y-4">
      {/* Title */}
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Today&apos;s Statistics</h3>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-gray-100 rounded-lg p-4 hover:bg-gray-200 transition-colors flex flex-col items-center gap-2"
          >
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              <Sparkline
                values={stat.trend as number[]}
                width={90}
                height={28}
                stroke="rgba(14, 165, 233, 0.9)"
                fill="rgba(14, 165, 233, 0.12)"
              />
            </div>
            <div className="text-sm text-gray-700 font-medium">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
