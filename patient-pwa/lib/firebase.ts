import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { clearIndexedDbPersistence, connectFirestoreEmulator, enableIndexedDbPersistence, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

// Your Firebase configuration
// Replace these values with your actual Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "waitfree-9b06e",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abc123def456",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-RRJG1S0KS4',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'asia-south1'); // Match your Cloud Functions region

let analyticsInstance: Analytics | null = null;
let analyticsInitPromise: Promise<Analytics | null> | null = null;

const resolveAnalytics = async (): Promise<Analytics | null> => {
  if (analyticsInstance) {
    return analyticsInstance;
  }
  const supported = await isSupported().catch((error) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[patient-pwa][firebase] Analytics support check failed:', error);
    }
    return false;
  });
  if (!supported) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[patient-pwa][firebase] Analytics not supported in this environment');
    }
    return null;
  }
  const instance = getAnalytics(app);
  analyticsInstance = instance;
  return instance;
};

export const loadAnalytics = async (): Promise<Analytics | null> => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (analyticsInstance) {
    return analyticsInstance;
  }
  if (!analyticsInitPromise) {
    analyticsInitPromise = resolveAnalytics().catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[patient-pwa][firebase] Failed to initialize Analytics', error);
      }
      return null;
    });
  }
  const instance = await analyticsInitPromise;
  analyticsInstance = instance;
  return instance;
};


type FirestoreInternals = Firestore & {
  _settings?: { host?: string };
  _app?: { options?: FirebaseOptions };
  app?: { options?: FirebaseOptions };
};

// Safety & diagnostics wrapper
if (typeof window !== 'undefined') {
  const proj = firebaseConfig.projectId;
  const wantEmu = (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' || process.env.NODE_ENV === 'development');
  let persistenceBlockedReason: 'emulator-connected' | null = null;
  if (proj === 'demo-project') {
    console.warn('[patient-pwa][firebase] WARNING: Using placeholder projectId demo-project. Set NEXT_PUBLIC_FIREBASE_PROJECT_ID for consistent local dev.');
  }
  try {
    if (wantEmu) {
      console.log('[patient-pwa][firebase] Connecting to Firebase emulators...');
      connectFirestoreEmulator(db, '127.0.0.1', 8081);
      connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
      connectFunctionsEmulator(functions, '127.0.0.1', 5002);
      // After attempting to connect, verify Firestore points to localhost host; Firestore v9 keeps settings internally
      const internal = db as FirestoreInternals;
      const host = internal._settings?.host;
      if (!host || !/localhost|127\.0\.0\.1/.test(host)) {
        console.error('[patient-pwa][firebase] Emulator connection attempt did not set a localhost host. Blocking to avoid prod writes.');
        throw new Error('Emulator connection failed');
      }
      const options = internal._app?.options ?? internal.app?.options;
      console.log('[patient-pwa][firebase] Emulator connected. projectId:', options?.projectId, 'host:', host);
      persistenceBlockedReason = 'emulator-connected';
    } else {
      const internal = db as FirestoreInternals;
      const options = internal._app?.options ?? internal.app?.options;
      console.log('[patient-pwa][firebase] NOT using emulators. projectId:', options?.projectId, 'NODE_ENV:', process.env.NODE_ENV);
    }
  } catch (err) {
    console.error('[patient-pwa][firebase] Fatal during emulator safety init:', err);
  }

  const persistencePref = process.env.NEXT_PUBLIC_ENABLE_PATIENT_PERSISTENCE;
  const normalizedPref = typeof persistencePref === 'string' ? persistencePref.trim().toLowerCase() : undefined;
  const persistenceOptIn = normalizedPref === 'true';
  const persistenceOptOut = normalizedPref === 'false';
  const defaultPersistenceEnabled = !wantEmu;
  const wantsPersistence = persistenceOptIn || (!persistenceOptOut && defaultPersistenceEnabled);

  if (wantEmu && persistenceOptIn && process.env.NODE_ENV === 'development') {
    console.warn('[patient-pwa][firebase] Persistence explicitly enabled while using emulators. Proceed with caution; INTERNAL ASSERTION errors may resurface.');
  }

  if (!wantsPersistence) {
    if (process.env.NODE_ENV === 'development') {
      const reason = persistenceOptOut
        ? 'env override'
        : persistenceBlockedReason === 'emulator-connected'
          ? 'disabled for emulator to avoid known Firestore INTERNAL ASSERTION failures'
          : 'default configuration';
      console.info('[patient-pwa][firebase] Firestore persistence not enabled:', reason);
    }
    void clearIndexedDbPersistence(db).catch((error: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.info('[patient-pwa][firebase] Skipped clearing IndexedDB persistence:', error);
      }
    });
  } else {
    type PersistenceWindow = Window & {
      __waitfreePatientPersistence?: Promise<void> | 'disabled';
    };
    const persistenceWindow = window as PersistenceWindow;
    if (!persistenceWindow.__waitfreePatientPersistence) {
      persistenceWindow.__waitfreePatientPersistence = enableIndexedDbPersistence(db)
        .then(() => {
          if (process.env.NODE_ENV === 'development') {
            console.info('[patient-pwa][firebase] Firestore persistence enabled');
          }
        })
        .catch((error: unknown) => {
          const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined;
          if (code === 'failed-precondition') {
            console.warn('[patient-pwa][firebase] Persistence skipped: multiple tabs detected');
            persistenceWindow.__waitfreePatientPersistence = 'disabled';
            return;
          }
          if (code === 'unimplemented') {
            console.warn('[patient-pwa][firebase] Persistence unsupported in this browser');
            persistenceWindow.__waitfreePatientPersistence = 'disabled';
            return;
          }
          console.warn('[patient-pwa][firebase] Persistence setup failed:', error);
          persistenceWindow.__waitfreePatientPersistence = 'disabled';
        });
    }
  }
}

export default app;
