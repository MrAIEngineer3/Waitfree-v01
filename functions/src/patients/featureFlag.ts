import { admin } from '../firebaseAdmin';
import type { PatientResolverFlagSnapshot, PatientResolverRolloutStage } from './types';

const FLAG_DOC_PATH = 'featureFlags/patientResolverV1';
const CACHE_TTL_MS = 60_000;
const isTruthyEnv = (value: string | undefined | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const shouldBypassCache =
  isTruthyEnv(process.env.FUNCTIONS_EMULATOR) ||
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  typeof process.env.FIRESTORE_EMULATOR_HOST === 'string';

let cachedSnapshot: { snapshot: PatientResolverFlagSnapshot; expiresAt: number } | null = null;

const normalizeRolloutStage = (value: unknown): PatientResolverRolloutStage => {
  if (typeof value !== 'string') {
    return 'off';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dry-run' || normalized === 'pilot' || normalized === 'on') {
    return normalized;
  }
  return 'off';
};

const readEnvOverride = (): PatientResolverFlagSnapshot | null => {
  const forced = process.env.PATIENT_RESOLVER_V1_FORCE;
  if (!forced) {
    return null;
  }
  const normalized = forced.trim().toLowerCase();
  if (normalized === 'on' || normalized === 'true') {
    return {
      enabled: true,
      rolloutStage: 'on',
      source: 'env'
    } satisfies PatientResolverFlagSnapshot;
  }
  if (normalized === 'pilot') {
    return {
      enabled: true,
      rolloutStage: 'pilot',
      source: 'env'
    } satisfies PatientResolverFlagSnapshot;
  }
  if (normalized === 'dry-run') {
    return {
      enabled: false,
      rolloutStage: 'dry-run',
      source: 'env'
    } satisfies PatientResolverFlagSnapshot;
  }
  return {
    enabled: false,
    rolloutStage: 'off',
    source: 'env'
  } satisfies PatientResolverFlagSnapshot;
};

const fetchFlagFromFirestore = async (): Promise<PatientResolverFlagSnapshot> => {
  const db = admin.firestore();
  const snap = await db.doc(FLAG_DOC_PATH).get();
  if (!snap.exists) {
    return {
      enabled: false,
      rolloutStage: 'off',
      source: 'default'
    } satisfies PatientResolverFlagSnapshot;
  }
  const data = snap.data() ?? {};
  const enabled = typeof data.enabled === 'boolean' ? data.enabled : false;
  const rolloutStage = normalizeRolloutStage(data.rolloutStage);
  return {
    enabled,
    rolloutStage: enabled ? (rolloutStage === 'off' ? 'on' : rolloutStage) : rolloutStage,
    source: 'firestore',
    updatedAt: snap.updateTime?.toDate().toISOString() ?? null
  } satisfies PatientResolverFlagSnapshot;
};

export const currentPatientResolverFlagSnapshot = async (
  options: { forceReload?: boolean } = {}
): Promise<PatientResolverFlagSnapshot> => {
  const envOverride = readEnvOverride();
  if (envOverride) {
    return envOverride;
  }

  if (!options.forceReload && !shouldBypassCache && cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
    return cachedSnapshot.snapshot;
  }

  try {
    const snapshot = await fetchFlagFromFirestore();
    if (!shouldBypassCache) {
      cachedSnapshot = {
        snapshot,
        expiresAt: Date.now() + CACHE_TTL_MS
      };
    } else {
      cachedSnapshot = null;
    }
    return snapshot;
  } catch (error) {
    console.warn('Failed to load patientResolverV1 flag – defaulting to OFF', error);
    return {
      enabled: false,
      rolloutStage: 'off',
      source: 'error'
    } satisfies PatientResolverFlagSnapshot;
  }
};

export interface ResolverFlagOptions {
  allowDryRun?: boolean;
  allowPilot?: boolean;
  forceReload?: boolean;
}

export const isPatientResolverV1Enabled = async (options: ResolverFlagOptions = {}): Promise<boolean> => {
  const snapshot = await currentPatientResolverFlagSnapshot({ forceReload: options.forceReload });
  if (snapshot.rolloutStage === 'on') {
    return snapshot.enabled;
  }
  if (snapshot.rolloutStage === 'pilot') {
    return options.allowPilot === true && snapshot.enabled;
  }
  if (snapshot.rolloutStage === 'dry-run') {
    return options.allowDryRun === true && snapshot.enabled;
  }
  return false;
};
