import { type Auth, type UserCredential } from 'firebase/auth';
import type { HttpsCallable } from 'firebase/functions';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    establishPatientSession,
    SessionEstablishmentError,
    type CreatePatientSessionPayload,
    type CreatePatientSessionResult,
    type EstablishSessionArgs,
    type EstablishSessionContext,
    type EstablishSessionDeps
} from '../app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/session';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('establishPatientSession', () => {
  const baseArgs: EstablishSessionArgs = {
    clinicId: 'clinic-1',
    doctorId: 'doctor-2',
    queueId: 'queue-3',
    patientId: 'patient-4'
  };

  const noopReplace = () => {
    /* noop */
  };

  const authStub = {} as Auth;

  let signInTokens: string[];

  const successDeps = (
    createSession: HttpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>
  ): EstablishSessionDeps => ({
    createSession,
    signInWithCustomToken: async (_auth, token) => {
      signInTokens.push(token);
      return {} as UserCredential;
    },
    auth: authStub
  });

  it('returns existing stored token and signs in with custom token', async () => {
    signInTokens = [];
    const storage = new MemoryStorage();
    storage.setItem('patientToken:patient-4', 'stored-token');
    const context: EstablishSessionContext = {
      locationHref: 'https://example.test/queue',
      replaceUrl: noopReplace,
      storage
    };

    let receivedPayload: CreatePatientSessionPayload | null = null;
    const createSession = (async (payload: CreatePatientSessionPayload) => {
      receivedPayload = payload;
      return { data: { token: 'custom-token', success: true } };
    }) as HttpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>;

    const token = await establishPatientSession(baseArgs, context, successDeps(createSession));

    assert.equal(token, 'stored-token');
    assert.deepEqual(receivedPayload, { ...baseArgs, token: 'stored-token' });
    assert.deepEqual(signInTokens, ['custom-token']);
  });

  it('pulls token from URL when storage is empty', async () => {
    signInTokens = [];
    const storage = new MemoryStorage();
    let cleanedUrl: string | null = null;
    const context: EstablishSessionContext = {
      locationHref: 'https://example.test/path?t=url-token&foo=1',
      replaceUrl: (url) => {
        cleanedUrl = url;
      },
      storage
    };

    const createSession = (async () => ({
      data: { token: 'custom-token', success: true }
    })) as HttpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>;

    const token = await establishPatientSession(baseArgs, context, successDeps(createSession));

    assert.equal(token, 'url-token');
    assert.equal(storage.getItem('patientToken:patient-4'), 'url-token');
    assert.equal(cleanedUrl, '/path?foo=1');
    assert.deepEqual(signInTokens, ['custom-token']);
  });

  it('throws a SessionEstablishmentError when token is missing', async () => {
    signInTokens = [];
    const storage = new MemoryStorage();
    const context: EstablishSessionContext = {
      locationHref: 'https://example.test/path',
      replaceUrl: noopReplace,
      storage
    };

    const createSession = (async () => ({
      data: { token: 'custom-token', success: true }
    })) as HttpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>;

    await assert.rejects(
      () => establishPatientSession(baseArgs, context, successDeps(createSession)),
      (err: unknown) => {
        assert.ok(err instanceof SessionEstablishmentError);
        assert.equal(err.message, 'Missing access token. Please re-join the queue or use the join form.');
        return true;
      }
    );
  });

  it('propagates failure when createSession returns empty token', async () => {
    signInTokens = [];
    const storage = new MemoryStorage();
    storage.setItem('patientToken:patient-4', 'stored-token');
    const context: EstablishSessionContext = {
      locationHref: 'https://example.test/path',
      replaceUrl: noopReplace,
      storage
    };

    const createSession = (async () => ({
      data: { token: '', success: false }
    })) as HttpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>;

    await assert.rejects(
      () => establishPatientSession(baseArgs, context, successDeps(createSession)),
      (err: unknown) => {
        assert.ok(err instanceof SessionEstablishmentError);
        assert.equal(err.message, 'Unable to authenticate your session. Please re-join the queue.');
        return true;
      }
    );
  });

  it('propagates failure when sign-in throws', async () => {
    signInTokens = [];
    const storage = new MemoryStorage();
    storage.setItem('patientToken:patient-4', 'stored-token');
    const context: EstablishSessionContext = {
      locationHref: 'https://example.test/path',
      replaceUrl: noopReplace,
      storage
    };

    const createSession = (async () => ({
      data: { token: 'custom-token', success: true }
    })) as HttpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>;

    const deps: EstablishSessionDeps = {
      createSession,
      signInWithCustomToken: async () => {
        throw new Error('firebase auth failure');
      },
      auth: authStub
    };

    await assert.rejects(
      () => establishPatientSession(baseArgs, context, deps),
      (err: unknown) => {
        assert.ok(err instanceof SessionEstablishmentError);
        assert.equal(err.message, 'Unable to authenticate your session. Please re-join the queue.');
        return true;
      }
    );
  });
});
