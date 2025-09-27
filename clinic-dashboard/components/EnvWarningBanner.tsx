"use client";
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';

interface FlagsInfo {
  projectId?: string;
  emulatorFlag: string | undefined;
  nodeEnv: string | undefined;
  firestoreHost?: string;
  warning?: string;
}

export default function EnvWarningBanner() {
  const [info, setInfo] = useState<FlagsInfo | null>(null);

  useEffect(() => {
    try {
      // Narrow the Firestore instance to a minimal internal shape without using 'any'
      type InternalFirestore = {
        _app?: { options?: { projectId?: string; apiKey?: string } };
        app?: { options?: { projectId?: string; apiKey?: string } };
        _settings?: { host?: string };
      };
      const internal = db as unknown as InternalFirestore;
      const appOpts = (internal._app || internal.app)?.options || {};
      const host = internal._settings?.host;
      const emulatorFlag = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
      let warning: string | undefined;
      if (emulatorFlag === 'true') {
        if (!host || !/localhost|127\.0\.0\.1/.test(host)) {
          warning = 'Emulator flag set but Firestore not pointing to localhost.';
        }
      }
      if (appOpts.projectId === 'demo-project') {
        warning = 'Using placeholder projectId demo-project; data isolation risk.';
      }
      setInfo({
        projectId: appOpts.projectId,
        emulatorFlag,
        nodeEnv: process.env.NODE_ENV,
        firestoreHost: host,
        warning
      });
    } catch {
      setInfo({ emulatorFlag: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR, nodeEnv: process.env.NODE_ENV, warning: 'Failed to introspect Firebase config' });
    }
  }, []);

  if (!info) return null;
  if (!info.warning) return null;

  return (
    <div className="mb-4 rounded-md border border-yellow-400 bg-yellow-100/60 px-4 py-2 text-xs text-yellow-800 flex flex-wrap gap-x-4 gap-y-1">
      <span className="font-semibold">Env Warning:</span>
      <span>{info.warning}</span>
      <span>| projectId: {info.projectId}</span>
      <span>| host: {info.firestoreHost || 'n/a'}</span>
      <span>| emulatorFlag: {info.emulatorFlag}</span>
    </div>
  );
}
