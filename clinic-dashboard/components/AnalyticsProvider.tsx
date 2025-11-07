'use client';

import { useEffect } from 'react';
import { loadAnalytics } from '../lib/firebase';

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
          console.debug('[clinic-dashboard] Firebase Analytics ready');
        }
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[clinic-dashboard] Failed to init Firebase Analytics', error);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
