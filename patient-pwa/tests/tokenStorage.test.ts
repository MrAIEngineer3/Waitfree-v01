import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ensurePatientToken, type StorageLike } from '../app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/tokenStorage';

class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('ensurePatientToken', () => {
  it('persists token from URL and scrubs query parameter', () => {
    const storage = new MemoryStorage();
    const locationUrl = new URL('https://example.test/clinics/c1?t=token-123&foo=1#section');
    let cleanedPath: string | null = null;

    const token = ensurePatientToken({
      patientId: 'patient-1',
      storage,
      locationUrl,
      replaceUrl: (cleaned) => {
        cleanedPath = cleaned;
      }
    });

    assert.equal(token, 'token-123');
    assert.equal(storage.getItem('patientToken:patient-1'), 'token-123');
    assert.equal(cleanedPath, '/clinics/c1?foo=1#section');
    assert.equal(locationUrl.searchParams.has('t'), false);
  });

  it('skips persistence when storage already holds a token', () => {
    const storage = new MemoryStorage();
    storage.setItem('patientToken:patient-2', 'cached-token');
    const locationUrl = new URL('https://example.test/path?t=new-token');
    let replaceCalls = 0;

    const token = ensurePatientToken({
      patientId: 'patient-2',
      storage,
      locationUrl,
      replaceUrl: () => {
        replaceCalls += 1;
      }
    });

    assert.equal(token, 'cached-token');
    assert.equal(replaceCalls, 0);
    assert.equal(locationUrl.searchParams.get('t'), 'new-token');
  });

  it('returns null when URL lacks a token parameter', () => {
    const storage = new MemoryStorage();
    const locationUrl = new URL('https://example.test/queues/q1?foo=1');
    let replaceCalls = 0;

    const token = ensurePatientToken({
      patientId: 'patient-3',
      storage,
      locationUrl,
      replaceUrl: () => {
        replaceCalls += 1;
      }
    });

    assert.equal(token, null);
    assert.equal(storage.getItem('patientToken:patient-3'), null);
    assert.equal(replaceCalls, 0);
  });

  it('produces clean path without query when token is the only parameter', () => {
    const storage = new MemoryStorage();
    const locationUrl = new URL('https://example.test/simple?t=solo');
    let cleanedPath: string | null = null;

    ensurePatientToken({
      patientId: 'patient-4',
      storage,
      locationUrl,
      replaceUrl: (cleaned) => {
        cleanedPath = cleaned;
      }
    });

    assert.equal(cleanedPath, '/simple');
  });
});
