#!/usr/bin/env ts-node
import type { Firestore } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import '../loadEnv';
import type { PatientMetadataInput, PatientResolverResult } from '../patients';
import { buildQueuePatientLink, normalizePatientFullName, resolvePatientForQueue } from '../patients';
import { computePatientPhoneHash } from '../patients/phoneHash';
import { normalizePhoneIfPresent } from '../utils/phone';

interface CliOptions {
  clinicIds: string[];
  includeQueues: string[];
  batchSize: number;
  limit: number | null;
  since?: Date | null;
  until?: Date | null;
  resumeToken?: string | null;
  output?: string | null;
  apply: boolean;
  confirm: boolean;
}

export interface BackfillPlan {
  clinicsDiscovered: number;
  queuesScanned: number;
  queuePatientsEvaluated: number;
  identitiesToCreate: number;
  linksToAttach: number;
  requiresManualReview: number;
}

interface DuplicateGroupSummary {
  clinicId: string;
  phoneHash: string;
  version: string;
  count: number;
}

export interface BackfillDetails {
  clinicIds: string[];
  duplicateGroups: DuplicateGroupSummary[];
  patientsWithPhone: number;
  normalizedPhones: number;
  invalidPhones: number;
  missingPhones: number;
  skippedOutsideWindow: number;
  limitReached: boolean;
}

interface BackfillApplyStats {
  processed: number;
  linked: number;
  alreadyLinked: number;
  skippedMissingPhone: number;
  skippedInvalidPhone: number;
  skippedOutsideWindow: number;
  resolverErrors: number;
  requiresReview: number;
  createdPatients: number;
  lastResumeToken: string | null;
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
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

const parseCsv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseDate = (value: string | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date provided: ${value}`);
  }
  return parsed;
};

const parseArgs = (): CliOptions => {
  const argMap = new Map<string, string>();
  for (const rawArg of process.argv.slice(2)) {
    if (!rawArg.startsWith('--')) {
      continue;
    }
    const trimmed = rawArg.slice(2);
    const [key, ...rest] = trimmed.split('=');
    argMap.set(key, rest.length > 0 ? rest.join('=') : 'true');
  }

  const clinicIds = parseCsv(argMap.get('clinicIds') ?? argMap.get('clinics'));
  const includeQueues = parseCsv(argMap.get('queueIds') ?? argMap.get('queues'));
  const batchSize = parsePositiveInt(argMap.get('batchSize'), 200);
  const limitRaw = argMap.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  const since = parseDate(argMap.get('since'));
  const until = parseDate(argMap.get('until'));

  const apply = parseBoolean(argMap.get('apply'), false);
  const confirm = parseBoolean(argMap.get('confirm'), false);

  const resumeToken = argMap.get('resume') ?? argMap.get('resumeToken') ?? null;
  const output = argMap.get('output') ?? argMap.get('json');

  return {
    clinicIds,
    includeQueues,
    batchSize,
    limit: Number.isFinite(limit ?? NaN) && (limit ?? 0) > 0 ? limit : null,
    since,
    until,
    resumeToken: resumeToken && resumeToken.length > 0 ? resumeToken : null,
    output: output && output.length > 0 ? output : null,
    apply,
    confirm
  } satisfies CliOptions;
};

const ensureApplySafety = (options: CliOptions): void => {
  if (!options.apply) {
    return;
  }
  if (!options.confirm) {
    console.error('Apply mode requested without --confirm flag. Aborting for safety.');
    process.exit(1);
  }
};

export const shouldIncludeQueue = (queueId: string, filter: string[]): boolean => {
  if (filter.length === 0) {
    return true;
  }
  return filter.includes(queueId);
};

export const isWithinDateRange = (
  joinedAt: FirebaseFirestore.Timestamp | null | undefined,
  since?: Date | null,
  until?: Date | null
): boolean => {
  if (!since && !until) {
    return true;
  }
  if (!joinedAt) {
    return false;
  }
  const joined = joinedAt.toDate();
  if (since && joined < since) {
    return false;
  }
  if (until && joined > until) {
    return false;
  }
  return true;
};

type ResumePointer = {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
};

const formatResumeToken = (pointer: ResumePointer): string => {
  return `${pointer.clinicId}|${pointer.doctorId}|${pointer.queueId}|${pointer.patientId}`;
};

const parseResumePointer = (token: string | null | undefined): ResumePointer | null => {
  if (!token) {
    return null;
  }
  const parts = token.split('|');
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) {
    console.warn('Ignoring malformed resume token. Expected format clinicId|doctorId|queueId|patientId.');
    return null;
  }
  return {
    clinicId: parts[0]!,
    doctorId: parts[1]!,
    queueId: parts[2]!,
    patientId: parts[3]!
  } satisfies ResumePointer;
};

export type BackfillCliOptions = CliOptions;

export const buildBackfillPlan = async (
  db: Firestore,
  options: CliOptions
): Promise<{ plan: BackfillPlan; details: BackfillDetails }> => {
  console.log('Planning patient identity backfill (read-only)...');
  if (options.resumeToken) {
    console.warn('Resume token support is not yet implemented. Token will be ignored in this scaffold.');
  }

  const identityKeys = new Set<string>();
  const duplicateMap = new Map<string, DuplicateGroupSummary>();
  const clinicIdsVisited = new Set<string>();

  const plan: BackfillPlan = {
    clinicsDiscovered: 0,
    queuesScanned: 0,
    queuePatientsEvaluated: 0,
    identitiesToCreate: 0,
    linksToAttach: 0,
    requiresManualReview: 0
  } satisfies BackfillPlan;

  let patientsWithPhone = 0;
  let normalizedPhones = 0;
  let invalidPhones = 0;
  let missingPhones = 0;
  let skippedOutsideWindow = 0;
  let limitReached = false;

  const clinicRefs = options.clinicIds.length > 0
    ? options.clinicIds.map((id) => db.collection('clinics').doc(id))
    : await db.collection('clinics').listDocuments();

  for (const clinicRef of clinicRefs) {
    const clinicId = clinicRef.id;
    clinicIdsVisited.add(clinicId);

    const doctorRefs = await clinicRef.collection('doctors').listDocuments();

    for (const doctorRef of doctorRefs) {
      const queueRefs = await doctorRef.collection('queues').listDocuments();

      for (const queueRef of queueRefs) {
        const queueId = queueRef.id;
        if (!shouldIncludeQueue(queueId, options.includeQueues)) {
          continue;
        }

        plan.queuesScanned += 1;
        const patientSnap = await queueRef.collection('patients').get();
        if (patientSnap.empty) {
          continue;
        }

        for (const doc of patientSnap.docs) {
          if (options.limit && plan.queuePatientsEvaluated >= options.limit) {
            limitReached = true;
            break;
          }

          plan.queuePatientsEvaluated += 1;

          const data = doc.data() as Record<string, unknown>;
          const joinedAt = data.joinedAt as FirebaseFirestore.Timestamp | undefined;
          if (!isWithinDateRange(joinedAt ?? null, options.since, options.until)) {
            skippedOutsideWindow += 1;
            continue;
          }

          const rawPhone = typeof data.phone === 'string' && data.phone.trim().length > 0
            ? data.phone.trim()
            : null;

          if (!rawPhone) {
            missingPhones += 1;
            continue;
          }

          patientsWithPhone += 1;

          let normalizedPhone: string | null = null;
          try {
            normalizedPhone = normalizePhoneIfPresent(rawPhone);
          } catch (error) {
            invalidPhones += 1;
            console.warn('Failed to normalize phone during planning', {
              clinicId,
              doctorId: doctorRef.id,
              queueId,
              patientId: doc.id,
              phone: rawPhone,
              error: error instanceof Error ? error.message : String(error)
            });
            continue;
          }

          if (!normalizedPhone) {
            continue;
          }

          normalizedPhones += 1;
          plan.linksToAttach += 1;

          try {
            const phoneHash = computePatientPhoneHash(normalizedPhone);
            const identityKey = `${clinicId}#${phoneHash.version}#${phoneHash.hash}`;
            identityKeys.add(identityKey);

            const existing = duplicateMap.get(identityKey);
            if (existing) {
              existing.count += 1;
            } else {
              duplicateMap.set(identityKey, {
                clinicId,
                phoneHash: phoneHash.hash,
                version: phoneHash.version,
                count: 1
              });
            }
          } catch (error) {
            invalidPhones += 1;
            console.warn('Failed to compute phone hash during planning', {
              clinicId,
              doctorId: doctorRef.id,
              queueId,
              patientId: doc.id,
              normalizedPhone,
              error: error instanceof Error ? error.message : String(error)
            });
            continue;
          }
        }

        if (limitReached) {
          break;
        }
      }

      if (limitReached) {
        break;
      }
    }

    if (limitReached) {
      break;
    }
  }

  plan.clinicsDiscovered = clinicIdsVisited.size;
  plan.identitiesToCreate = identityKeys.size;

  const duplicateGroups = Array.from(duplicateMap.values()).filter((group) => group.count > 1);
  plan.requiresManualReview = duplicateGroups.length;

  const details: BackfillDetails = {
    clinicIds: Array.from(clinicIdsVisited.values()),
    duplicateGroups,
    patientsWithPhone,
    normalizedPhones,
    invalidPhones,
    missingPhones,
    skippedOutsideWindow,
    limitReached
  } satisfies BackfillDetails;

  return { plan, details };
};

const persistPlanIfRequested = async (plan: BackfillPlan, details: BackfillDetails, options: CliOptions): Promise<void> => {
  if (!options.output) {
    return;
  }
  const fs = await import('fs');
  await fs.promises.writeFile(
    options.output,
    JSON.stringify({ generatedAt: new Date().toISOString(), options, plan, details }, null, 2),
    'utf8'
  );
  console.log(`Wrote plan details to ${options.output}`);
};

export const applyBackfill = async (db: Firestore, options: CliOptions): Promise<BackfillApplyStats> => {
  const stats: BackfillApplyStats = {
    processed: 0,
    linked: 0,
    alreadyLinked: 0,
    skippedMissingPhone: 0,
    skippedInvalidPhone: 0,
    skippedOutsideWindow: 0,
    resolverErrors: 0,
    requiresReview: 0,
    createdPatients: 0,
    lastResumeToken: null
  } satisfies BackfillApplyStats;

  const resumePointer = parseResumePointer(options.resumeToken);
  let awaitingResumeMatch = resumePointer !== null;

  const clinicRefs = options.clinicIds.length > 0
    ? options.clinicIds.map((id) => db.collection('clinics').doc(id))
    : await db.collection('clinics').listDocuments();

  for (const clinicRef of clinicRefs) {
    const clinicId = clinicRef.id;
    const doctorRefs = await clinicRef.collection('doctors').listDocuments();

    for (const doctorRef of doctorRefs) {
      const doctorId = doctorRef.id;
      const queueRefs = await doctorRef.collection('queues').listDocuments();

      for (const queueRef of queueRefs) {
        const queueId = queueRef.id;
        if (!shouldIncludeQueue(queueId, options.includeQueues)) {
          continue;
        }

        const patientSnap = await queueRef.collection('patients').get();
        if (patientSnap.empty) {
          continue;
        }

        for (const doc of patientSnap.docs) {
          const pointer: ResumePointer = {
            clinicId,
            doctorId,
            queueId,
            patientId: doc.id
          } satisfies ResumePointer;

          const pointerToken = formatResumeToken(pointer);

          if (awaitingResumeMatch) {
            if (resumePointer && pointerToken === formatResumeToken(resumePointer)) {
              awaitingResumeMatch = false;
              console.log('Resume token matched. Resuming processing after', pointerToken);
              continue; // skip the resume match itself to avoid duplicate work
            }
            continue;
          }

          if (options.limit && stats.processed >= options.limit) {
            console.warn('Backfill apply limit reached. Stopping early.');
            return stats;
          }

          stats.processed += 1;
          stats.lastResumeToken = pointerToken;

          const data = doc.data() as Record<string, unknown>;

          if (data.patientIdentityLink && typeof data.patientIdentityLink === 'object') {
            stats.alreadyLinked += 1;
            continue;
          }

          const joinedAt = data.joinedAt as FirebaseFirestore.Timestamp | undefined;
          if (!isWithinDateRange(joinedAt ?? null, options.since, options.until)) {
            stats.skippedOutsideWindow += 1;
            continue;
          }

          const rawPhone = typeof data.phone === 'string' && data.phone.trim().length > 0
            ? data.phone.trim()
            : null;

          if (!rawPhone) {
            stats.skippedMissingPhone += 1;
            continue;
          }

          let normalizedPhone: string | null = null;
          try {
            normalizedPhone = normalizePhoneIfPresent(rawPhone);
          } catch (error) {
            stats.skippedInvalidPhone += 1;
            console.warn('Skipping patient due to phone normalization error', {
              clinicId,
              doctorId,
              queueId,
              patientId: doc.id,
              phone: rawPhone,
              error: error instanceof Error ? error.message : String(error)
            });
            continue;
          }

          if (!normalizedPhone) {
            stats.skippedMissingPhone += 1;
            continue;
          }

          const rawName = typeof data.name === 'string' ? data.name.trim() : '';
          if (!rawName) {
            console.warn('Skipping patient because name is missing', {
              clinicId,
              doctorId,
              queueId,
              patientId: doc.id
            });
            stats.resolverErrors += 1;
            continue;
          }

          const normalizedName = rawName;
          const normalizedFullName = normalizePatientFullName(normalizedName);

          const metadata: PatientMetadataInput = {};
          if (typeof data.age === 'number' && Number.isFinite(data.age)) {
            metadata.age = data.age;
          }

          let resolverResult: PatientResolverResult | null = null;
          try {
            resolverResult = await resolvePatientForQueue({
              actor: {
                actorType: 'system',
                actorId: 'script:patientResolverBackfill',
                actorClinicId: clinicId
              },
              context: {
                clinicId,
                doctorId,
                queueId,
                queueDate: queueId
              },
              patient: {
                name: normalizedName,
                normalizedName: normalizedFullName,
                age: typeof metadata.age === 'number' ? metadata.age : undefined,
                phone: {
                  normalized: normalizedPhone
                },
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined
              },
              allowCreate: true
            });
          } catch (error) {
            stats.resolverErrors += 1;
            console.error('Resolver failed during backfill apply', {
              clinicId,
              doctorId,
              queueId,
              patientId: doc.id,
              error: error instanceof Error ? error.message : String(error)
            });
            continue;
          }

          const patientIdentityLink = buildQueuePatientLink(resolverResult);
          const patientResolverSummary = {
            version: resolverResult.resolverVersion,
            matchType: resolverResult.matchType,
            confidence: resolverResult.confidence,
            requiresReview: resolverResult.requiresReview,
            metadataVersion: resolverResult.metadataVersion,
            ambiguityId: resolverResult.ambiguityEntryRef?.id ?? null
          } satisfies Record<string, unknown>;

          try {
            await queueRef.collection('patients').doc(doc.id).set(
              {
                patientIdentityId: resolverResult.patientId,
                patientIdentityLink,
                patientResolver: patientResolverSummary,
                requiresPatientReview: resolverResult.requiresReview === true
              },
              { merge: true }
            );
          } catch (error) {
            stats.resolverErrors += 1;
            console.error('Failed to update queue patient with resolver link', {
              clinicId,
              doctorId,
              queueId,
              patientId: doc.id,
              error: error instanceof Error ? error.message : String(error)
            });
            continue;
          }

          stats.linked += 1;
          if (resolverResult.requiresReview) {
            stats.requiresReview += 1;
          }
          if (resolverResult.createdNewPatient) {
            stats.createdPatients += 1;
          }

          if (stats.linked % options.batchSize === 0) {
            console.log('Backfill progress', {
              linked: stats.linked,
              processed: stats.processed,
              lastResumeToken: stats.lastResumeToken
            });
          }
        }
      }
    }
  }

  return stats;
};

const main = async () => {
  const options = parseArgs();
  const db = admin.firestore();

  if (options.since && options.until && options.since > options.until) {
    console.error('The --since date must be before --until.');
    process.exit(1);
  }

  const { plan, details } = await buildBackfillPlan(db, options);
  console.log('Backfill plan summary:', plan);
  if (details.duplicateGroups.length > 0) {
    console.log('Duplicate hash groups flagged for review:', details.duplicateGroups.slice(0, 10));
    if (details.duplicateGroups.length > 10) {
      console.log(`...and ${details.duplicateGroups.length - 10} additional groups.`);
    }
  }
  if (details.invalidPhones > 0) {
    console.warn('Invalid phone entries encountered during planning:', details.invalidPhones);
  }
  if (details.skippedOutsideWindow > 0) {
    console.log('Patients skipped for falling outside the requested date window:', details.skippedOutsideWindow);
  }
  if (details.limitReached) {
    console.warn('Patient sampling limit reached. Consider re-running with a higher --limit for complete coverage.');
  }
  await persistPlanIfRequested(plan, details, options);

  ensureApplySafety(options);

  if (options.apply) {
    console.log('Executing backfill apply mode...');
    const applyStats = await applyBackfill(db, options);
    console.log('Backfill apply completed with stats:', applyStats);
    if (applyStats.lastResumeToken) {
      console.log('Resume token for next run:', applyStats.lastResumeToken);
    }
  } else {
    console.log('Backfill completed in plan-only mode. Re-run with --apply --confirm to write changes.');
  }

  process.exit(0);
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Backfill scaffold failed', error);
    process.exit(1);
  });
}
