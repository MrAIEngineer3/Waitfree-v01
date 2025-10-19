/**
 * Local environment loader for Firebase Functions emulator & scripts.
 * Production (deployed) functions SHOULD NOT rely on dotenv files shipped in the bundle; instead use:
 *  - Firebase CLI managed environment files (.env, .env.production, etc.)
 *  - Secret Manager via functions v2 or environment variables set in deploy pipeline
 *
 * This file attempts to load .env.local (preferred) then fallback to .env
 * ONLY when running locally (emulator or direct node script). It is safe to import
 * at top of entrypoints (index.ts, notifier.ts, test scripts) because in production
 * the files will not exist and dotenv will silently ignore.
 */
import fs from 'fs';
import path from 'path';

let loaded = false;

export function loadLocalEnv() {
  if (loaded) return; // idempotent

  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST;
  // We load for emulator OR if explicitly marked by NODE_ENV=development
  if (!(isEmulator || process.env.NODE_ENV === 'development')) {
    loaded = true;
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const candidates = [
    path.join(rootDir, '.env.local'),
    path.join(rootDir, '.env')
  ];

  try {
    // Lazy require dotenv to avoid adding weight if unused
    const dotenv = require('dotenv');
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const result = dotenv.config({ path: file });
        if (result.error) {
          console.warn('[env] Failed loading', file, result.error.message);
        } else {
          console.log('[env] Loaded environment variables from', path.basename(file));
          break; // stop after first existing file
        }
      }
    }
  } catch (e:any) {
    console.warn('[env] dotenv not available or failed to load:', e.message);
  }

  loaded = true;
}

// Auto-run on import for convenience
loadLocalEnv();
