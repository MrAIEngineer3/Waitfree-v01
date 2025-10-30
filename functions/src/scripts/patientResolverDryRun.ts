#!/usr/bin/env ts-node
import type { Timestamp } from 'firebase-admin/firestore';
import { admin } from '../firebaseAdmin';
import '../loadEnv';
import { computePatientPhoneHash } from '../patients/phoneHash';
import type { PatientPhoneHash } from '../patients/types';
import { normalizePhoneIfPresent } from '../utils/phone';

interface CliOptions {
  clinicIds: string[];
  limit: number | null;
  includeQueues: string[];
  jsonOutput?: string | null;
  since?: Date | null;
  until?: Date | null;
}

interface QueuePatientInfo {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  tokenNumber: number | null;
  joinedAt?: Timestamp | null;
  alreadyLinked: boolean;
}

interface DuplicateGroup {
  hashKey: string;
  phoneHash: string;
  version: string;
  clinicId: string;
  count: number;
  patients: QueuePatientInfo[];
}

const parseCsvArg = (value: string | undefined | null): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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
  for (const entry of process.argv.slice(2)) {
    const [rawKey, ...rest] = entry.split('=');
    if (rawKey.startsWith('--')) {
      argMap.set(rawKey.slice(2), rest.join('=') ?? '');
    }
  }

  const clinicIds = parseCsvArg(argMap.get('clinicIds') ?? argMap.get('clinics'));
  const includeQueues = parseCsvArg(argMap.get('queueIds') ?? argMap.get('queues'));
  const limitRaw = argMap.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  const jsonOutput = argMap.get('json');
  const since = parseDate(argMap.get('since'));
  const until = parseDate(argMap.get('until'));

  return {
    clinicIds,
    includeQueues,
    limit: Number.isFinite(limit ?? NaN) && (limit ?? 0) > 0 ? limit : null,
    jsonOutput: jsonOutput && jsonOutput.length > 0 ? jsonOutput : null,
    since,
    until
  } satisfies CliOptions;
};

const shouldIncludeQueue = (queueId: string, filter: string[]): boolean => {
  if (filter.length === 0) {
    return true;
  }
  return filter.includes(queueId);
};

const isWithinDateRange = (
  joinedAt: Timestamp | null | undefined,
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

const formatResumeToken = (info: { clinicId: string; doctorId: string; queueId: string; patientId: string }): string => {
  return `${info.clinicId}|${info.doctorId}|${info.queueId}|${info.patientId}`;
};

(async () => {
  const options = parseArgs();
  const db = admin.firestore();

  const clinicRefs = options.clinicIds.length > 0
    ? options.clinicIds.map((id) => db.collection('clinics').doc(id))
    : await db.collection('clinics').listDocuments();

  const duplicateMap = new Map<string, DuplicateGroup>();
  let queuePatientsEvaluated = 0;
  let patientsWithPhone = 0;
  let normalizedPhones = 0;
  let missingPhones = 0;
  let invalidPhones = 0;
  let clinicsProcessed = 0;
  let patientsAlreadyLinked = 0;
  let skippedOutsideWindow = 0;
  let limitReached = false;
  let lastResumeToken: string | null = null;

  for (const clinicRef of clinicRefs) {
    const clinicId = clinicRef.id;
    clinicsProcessed += 1;
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
          if (options.limit && queuePatientsEvaluated >= options.limit) {
            limitReached = true;
            break;
          }

          queuePatientsEvaluated += 1;

          const data = doc.data() as Record<string, unknown>;
          const joinedAt = (data.joinedAt as Timestamp | undefined) ?? null;
          const rawPhone = typeof data.phone === 'string' && data.phone.trim().length > 0 ? data.phone.trim() : null;
          const alreadyLinked = Boolean(data.patientIdentityLink && typeof data.patientIdentityLink === 'object');

          if (alreadyLinked) {
            patientsAlreadyLinked += 1;
          }

          lastResumeToken = formatResumeToken({
            clinicId,
            doctorId,
            queueId,
            patientId: doc.id
          });

          if (!isWithinDateRange(joinedAt, options.since, options.until)) {
            skippedOutsideWindow += 1;
            continue;
          }

          if (!rawPhone) {
            missingPhones += 1;
            continue;
          }

          patientsWithPhone += 1;

          let normalizedPhone: string | null = null;
          try {
            normalizedPhone = normalizePhoneIfPresent(rawPhone);
            if (normalizedPhone) {
              normalizedPhones += 1;
            } else {
              missingPhones += 1;
            }
          } catch (error) {
            invalidPhones += 1;
            console.warn('Failed to normalize phone', {
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
            continue;
          }

          const patientInfo: QueuePatientInfo = {
            clinicId,
            doctorId,
            queueId,
            patientId: doc.id,
            name: typeof data.name === 'string' ? data.name : '(unknown)',
            phone: rawPhone,
            normalizedPhone,
            tokenNumber: typeof data.tokenNumber === 'number' ? data.tokenNumber : null,
            joinedAt,
            alreadyLinked
          } satisfies QueuePatientInfo;

          let phoneHash: PatientPhoneHash | null = null;
          try {
            phoneHash = computePatientPhoneHash(normalizedPhone);
          } catch (error) {
            invalidPhones += 1;
            console.warn('Failed to compute phone hash', {
              clinicId,
              doctorId,
              queueId,
              patientId: doc.id,
              error: error instanceof Error ? error.message : String(error)
            });
            continue;
          }

          const hashKey = `${clinicId}#${phoneHash.version}#${phoneHash.hash}`;
          const existing = duplicateMap.get(hashKey);
          if (existing) {
            existing.count += 1;
            existing.patients.push(patientInfo);
          } else {
            duplicateMap.set(hashKey, {
              hashKey,
              phoneHash: phoneHash.hash,
              version: phoneHash.version,
              clinicId,
              count: 1,
              patients: [patientInfo]
            });
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

  const duplicates = Array.from(duplicateMap.values()).filter((group) => group.count > 1);
  duplicates.sort((a, b) => b.count - a.count);

  const summary = {
    clinicsProcessed,
    queuePatientsEvaluated,
    patientsAlreadyLinked,
    patientsWithPhone,
    normalizedPhones,
    missingPhones,
    invalidPhones,
    skippedOutsideWindow,
    duplicateGroups: duplicates.length,
    limitReached,
    lastResumeToken
  };

  console.log('Dry-run summary:', summary);

  if (duplicates.length > 0) {
    console.log('\nTop duplicate groups:');
    for (const group of duplicates.slice(0, 10)) {
      console.log(`- clinic=${group.clinicId} phoneHash=${group.phoneHash} version=${group.version} count=${group.count}`);
      for (const patient of group.patients) {
        console.log(
          `  • ${patient.clinicId}/${patient.doctorId}/${patient.queueId}/${patient.patientId} name="${patient.name}" token=${patient.tokenNumber ?? 'n/a'} phone=${patient.phone ?? 'n/a'} linked=${patient.alreadyLinked ? 'yes' : 'no'}`
        );
      }
    }
  } else {
    console.log('No duplicate phone hashes detected in the scanned scope.');
  }

  if (options.jsonOutput) {
    const fs = await import('fs');
    const path = await import('path');
    const payload = {
      summary,
      duplicates
    };
    const dir = path.dirname(options.jsonOutput);
    if (dir && dir !== '.') {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    await fs.promises.writeFile(options.jsonOutput, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote detailed output to ${options.jsonOutput}`);
  }

  process.exit(0);
})().catch((error) => {
  console.error('Dry-run failed', error);
  process.exit(1);
});
