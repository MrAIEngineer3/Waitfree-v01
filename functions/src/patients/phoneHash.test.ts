import { describe, expect, it, vi } from 'vitest';
import { computePatientPhoneHash } from './phoneHash';

vi.stubEnv('PATIENT_PHONE_HASH_SECRET', 'test-secret');

describe('computePatientPhoneHash', () => {
  it('produces deterministic hashes for the same number and version', async () => {
    const first = await computePatientPhoneHash('+911234567890', 'v1');
    const second = await computePatientPhoneHash('+911234567890', 'v1');
    expect(first.hash).toEqual(second.hash);
    expect(first.version).toBe('v1');
    expect(first.lastFour).toBe('7890');
  });

  it('differs across versions', async () => {
    vi.stubEnv('PATIENT_PHONE_HASH_SECRET_V2', 'test-secret-v2');
    const v1 = await computePatientPhoneHash('+911234567890', 'v1');
    const v2 = await computePatientPhoneHash('+911234567890', 'v2');
    expect(v1.hash).not.toEqual(v2.hash);
  });
});
