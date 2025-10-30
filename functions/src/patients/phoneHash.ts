import crypto from 'crypto';
import { admin } from '../firebaseAdmin';
import { PATIENT_PHONE_LOOKUP_COLLECTION, PHONE_HASH_DEFAULT_VERSION } from './constants';
import type { PatientPhoneHash } from './types';

const hashSecretCache = new Map<string, Buffer>();

const resolveSecretForVersion = (version: string): Buffer => {
  const cacheKey = version;
  const cached = hashSecretCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const envName = version === 'v1' ? 'PATIENT_PHONE_HASH_SECRET' : `PATIENT_PHONE_HASH_SECRET_${version.toUpperCase()}`;
  const secret = process.env[envName];
  if (!secret || secret.trim().length === 0) {
    throw new Error(`Missing phone hash secret for version ${version}. Set ${envName}.`);
  }

  const buffer = Buffer.from(secret, 'utf8');
  hashSecretCache.set(cacheKey, buffer);
  return buffer;
};

const resolveActiveVersion = (): string => {
  const env = process.env.PATIENT_PHONE_HASH_ACTIVE_VERSION;
  if (env && env.trim().length > 0) {
    return env.trim();
  }
  return PHONE_HASH_DEFAULT_VERSION;
};

export const computePatientPhoneHash = (normalizedPhone: string, version?: string): PatientPhoneHash => {
  const hashVersion = version ?? resolveActiveVersion();
  const secret = resolveSecretForVersion(hashVersion);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(normalizedPhone);
  const digest = hmac.digest('hex');
  const lastFour = normalizedPhone.slice(-4);
  const countryCodeMatch = normalizedPhone.match(/^\+(\d{1,4})/);
  return {
    hash: digest,
    version: hashVersion,
    lastFour,
    countryCode: countryCodeMatch ? countryCodeMatch[1] : null
  };
};

export const buildPhoneLookupId = (clinicId: string, phoneHash: PatientPhoneHash): string => {
  return `${clinicId}#${phoneHash.version}#${phoneHash.hash}`;
};

export const getPhoneLookupRef = (clinicId: string, phoneHash: PatientPhoneHash) => {
  const db = admin.firestore();
  return db.collection(PATIENT_PHONE_LOOKUP_COLLECTION).doc(buildPhoneLookupId(clinicId, phoneHash));
};
