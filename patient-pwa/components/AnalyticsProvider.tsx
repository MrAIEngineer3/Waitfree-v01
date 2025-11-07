'use client';

import { loadAnalytics } from '@/lib/firebase';
import { useEffect } from 'react';

export function AnalyticsProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let mounted = true;
    loadAnalytics()
      .then((instance) => {
        if (!mounted || !instance) {
          return;
        }
        if (process.env.NODE_ENV === 'development') {
          console.debug('[patient-pwa] Firebase Analytics ready');
        }
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[patient-pwa] Failed to init Firebase Analytics', error);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
