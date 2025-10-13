import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, enableIndexedDbPersistence, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

// Your Firebase configuration
// Replace these values with your actual Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "waitfree-9b06e",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:demo",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

type FirebaseClientState = {
  persistencePromise?: Promise<void> | null;
  emulatorPromise?: Promise<void> | null;
  emulatorsConnected?: boolean;
};

declare global {
  interface Window {
    __waitfreeFirebaseState__?: FirebaseClientState;
  }
}

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'asia-south1'); // Match your Cloud Functions region
export const storage = getStorage(app);

const getClientState = (): FirebaseClientState | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!window.__waitfreeFirebaseState__) {
    window.__waitfreeFirebaseState__ = {};
  }
  return window.__waitfreeFirebaseState__;
};

// Connect to emulators in development / explicit flag with safety verification
if (typeof window !== 'undefined') {
  const clientState = getClientState();
  const wantEmu = (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' || process.env.NODE_ENV === 'development');
  const proj = firebaseConfig.projectId;
  if (proj === 'demo-project') {
    console.warn('[clinic-dashboard][firebase] WARNING: Using placeholder projectId demo-project. Set NEXT_PUBLIC_FIREBASE_PROJECT_ID.');
  }
  if (wantEmu) {
    if (clientState && !clientState.emulatorsConnected && !clientState.emulatorPromise) {
      clientState.emulatorPromise = (async () => {
        try {
          console.log('[clinic-dashboard][firebase] Connecting to Firebase emulators...');
          connectFirestoreEmulator(db, '127.0.0.1', 8081);
          connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
          connectFunctionsEmulator(functions, '127.0.0.1', 5002);
          try { connectStorageEmulator(storage, '127.0.0.1', 9199); } catch {}
          type InternalFirestore = { _settings?: { host?: string } };
          const internal = db as unknown as InternalFirestore;
          const host = internal._settings?.host;
          if (!host || !/localhost|127\.0\.0\.1/.test(host)) {
            console.error('[clinic-dashboard][firebase] Emulator host not set after connect. Aborting to prevent prod writes.');
            throw new Error('Emulator connection failed');
          }
          console.log('[clinic-dashboard][firebase] Emulator connected. projectId:', proj, 'host:', host);
          clientState.emulatorsConnected = true;
        } catch (error) {
          console.error('[clinic-dashboard][firebase] Emulator connection safety failure:', error);
        } finally {
          clientState.emulatorPromise = null;
        }
      })();
    }
  } else {
    console.log('[clinic-dashboard][firebase] Running without emulators. projectId:', proj);
  }
  if (clientState && !clientState.persistencePromise) {
    clientState.persistencePromise = (async () => {
      await (wantEmu ? clientState.emulatorPromise?.catch(() => undefined) : undefined);
      try {
        await enableIndexedDbPersistence(db);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[clinic-dashboard][firebase] IndexedDB persistence disabled:', error);
        }
      }
    })();
  }
}

// Optionally enable anonymous sign-in (only if explicitly allowed via env)
if (typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_ALLOW_ANONYMOUS === 'true')) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      try {
        const { signInAnonymously } = await import('firebase/auth');
        await signInAnonymously(auth);
      } catch (e) {
        console.warn('Anonymous sign-in failed:', e);
      }
    }
  });
}

export default app;
