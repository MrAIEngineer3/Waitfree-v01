#!/usr/bin/env ts-node
import { FieldValue } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import '../loadEnv';
import type { PatientResolverFlagSnapshot, PatientResolverRolloutStage } from '../patients';
import { PATIENT_RESOLVER_VERSION } from '../patients/constants';

const FLAG_PATH = 'featureFlags/patientResolverV1';

type CliOptions = {
  enabled: boolean;
  rolloutStage: PatientResolverRolloutStage;
  note?: string | null;
  dryRun: boolean;
};

const parseBoolean = (value: string | undefined | null, fallback: boolean): boolean => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parseRolloutStage = (value: string | undefined | null): PatientResolverRolloutStage => {
  if (!value) {
    return 'off';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dry-run' || normalized === 'pilot' || normalized === 'on') {
    return normalized;
  }
  return 'off';
};

const parseArgs = (): CliOptions => {
  const argMap = new Map<string, string>();
  for (const entry of process.argv.slice(2)) {
    const [key, ...rest] = entry.split('=');
    if (key.startsWith('--')) {
      argMap.set(key.slice(2), rest.join('=') ?? '');
    }
  }

  const enabled = parseBoolean(argMap.get('enabled'), false);
  const rolloutStage = parseRolloutStage(argMap.get('stage'));
  const note = argMap.get('note');
  const dryRun = parseBoolean(argMap.get('dry-run'), false);

  return { enabled, rolloutStage, note: note?.length ? note : undefined, dryRun } satisfies CliOptions;
};

const formatSnapshot = (snapshot: PatientResolverFlagSnapshot | null): string => {
  if (!snapshot) {
    return '(none)';
  }
  return JSON.stringify(snapshot, null, 2);
};

(async () => {
  const options = parseArgs();
  const db = admin.firestore();
  const docRef = db.doc(FLAG_PATH);
  const existingSnap = await docRef.get();
  const existingData = (existingSnap.exists ? existingSnap.data() : undefined) as PatientResolverFlagSnapshot | undefined;

  console.log('Current snapshot:', formatSnapshot(existingData ?? null));
  console.log('Requested update:', {
    enabled: options.enabled,
    rolloutStage: options.rolloutStage,
    note: options.note ?? null,
    dryRun: options.dryRun
  });

  if (options.dryRun) {
    console.log('Dry run enabled – skipping write.');
    process.exit(0);
  }

  const payload = {
    enabled: options.enabled,
    rolloutStage: options.rolloutStage,
    version: PATIENT_RESOLVER_VERSION,
    note: options.note ?? null,
    updatedAt: FieldValue.serverTimestamp()
  } satisfies Record<string, unknown>;

  await docRef.set(payload, { merge: true });
  const updatedSnap = await docRef.get();
  console.log('Updated snapshot:', formatSnapshot((updatedSnap.data() ?? null) as PatientResolverFlagSnapshot | null));
})();
