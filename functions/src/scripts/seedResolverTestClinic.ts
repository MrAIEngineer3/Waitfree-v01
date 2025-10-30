#!/usr/bin/env ts-node
import { admin } from '../firebaseAdmin';
import '../loadEnv';

type SeedPatient = {
  id: string;
  name: string;
  phone: string;
  tokenNumber: number;
};

type CliOptions = {
  clinicId: string;
  doctorId: string;
  queueDate: string;
  queueId?: string | null;
  primaryPhone: string;
  duplicateName: string;
  duplicateToken: number;
  controlPhone: string;
  deleteFixture: boolean;
};

const DEFAULTS: CliOptions = {
  clinicId: 'resolver-test-clinic',
  doctorId: 'resolver-test-doctor',
  queueDate: '2025-10-29',
  queueId: '2025-10-29-test',
  primaryPhone: '9644830895',
  duplicateName: 'Resolver Test Duplicate',
  duplicateToken: 2,
  controlPhone: '9826023456',
  deleteFixture: false
};

const parseBoolean = (value: string | undefined): boolean => {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseArgs = (): CliOptions => {
  const argMap = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) {
      continue;
    }
    const trimmed = raw.slice(2);
    const [key, ...rest] = trimmed.split('=');
    argMap.set(key, rest.length > 0 ? rest.join('=') : 'true');
  }

  const clinicId = argMap.get('clinicId') ?? DEFAULTS.clinicId;
  const doctorId = argMap.get('doctorId') ?? DEFAULTS.doctorId;
  const queueDate = argMap.get('queueDate') ?? DEFAULTS.queueDate;
  const queueId = argMap.get('queueId') ?? `${queueDate}-test`;
  const primaryPhone = argMap.get('primaryPhone') ?? DEFAULTS.primaryPhone;
  const duplicateName = argMap.get('duplicateName') ?? DEFAULTS.duplicateName;
  const duplicateToken = Number.parseInt(argMap.get('duplicateToken') ?? `${DEFAULTS.duplicateToken}`, 10) || DEFAULTS.duplicateToken;
  const controlPhone = argMap.get('controlPhone') ?? DEFAULTS.controlPhone;
  const deleteFixture = parseBoolean(argMap.get('delete'));

  return {
    clinicId,
    doctorId,
    queueDate,
    queueId,
    primaryPhone,
    duplicateName,
    duplicateToken,
    controlPhone,
    deleteFixture
  } satisfies CliOptions;
};

const buildPatients = (options: CliOptions): SeedPatient[] => [
  {
    id: 'test-patient-1',
    name: 'Resolver Test Primary',
    phone: options.primaryPhone,
    tokenNumber: 1
  },
  {
    id: 'test-patient-2',
    name: options.duplicateName,
    phone: options.primaryPhone,
    tokenNumber: options.duplicateToken
  },
  {
    id: 'test-patient-3',
    name: 'Resolver Test Control',
    phone: options.controlPhone,
    tokenNumber: options.duplicateToken + 1
  }
];

const deleteFixture = async (options: CliOptions): Promise<void> => {
  const db = admin.firestore();
  const clinicRef = db.collection('clinics').doc(options.clinicId);
  const doctorRef = clinicRef.collection('doctors').doc(options.doctorId);
  const queueRef = doctorRef.collection('queues').doc(options.queueId ?? `${options.queueDate}-test`);

  const patientRefs = await queueRef.collection('patients').listDocuments();
  for (const ref of patientRefs) {
    await ref.delete();
  }
  await queueRef.delete().catch(() => undefined);
  await doctorRef.delete().catch(() => undefined);
  await clinicRef.delete().catch(() => undefined);
  console.log('Deleted resolver test clinic fixture.');
};

(async () => {
  const options = parseArgs();
  if (options.deleteFixture) {
    await deleteFixture(options);
    process.exit(0);
  }

  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const clinicRef = db.collection('clinics').doc(options.clinicId);

  await clinicRef.set(
    {
      name: 'Resolver Test Clinic',
      testFixture: true,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  );

  const doctorRef = clinicRef.collection('doctors').doc(options.doctorId);
  await doctorRef.set(
    {
      name: 'Resolver Test Doctor',
      testFixture: true,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  );

  const queueDocId = options.queueId ?? `${options.queueDate}-test`;
  const queueRef = doctorRef.collection('queues').doc(queueDocId);
  await queueRef.set(
    {
      name: 'Resolver Test Queue',
      date: options.queueDate,
      testFixture: true,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  );

  const patients = buildPatients(options);
  for (const patient of patients) {
    await queueRef.collection('patients').doc(patient.id).set(
      {
        name: patient.name,
        phone: patient.phone,
        tokenNumber: patient.tokenNumber,
        testFixture: true,
        status: 'waiting',
        joinedAt: now,
        updatedAt: now,
        createdAt: now
      },
      { merge: true }
    );
  }

  console.log('Seeded resolver test clinic with sample patients.');
  console.log({
    clinicId: options.clinicId,
    doctorId: options.doctorId,
    queueId: queueDocId,
    primaryPhone: options.primaryPhone,
    controlPhone: options.controlPhone
  });
  process.exit(0);
})().catch((error) => {
  console.error('Failed to seed resolver test clinic', error);
  process.exit(1);
});
