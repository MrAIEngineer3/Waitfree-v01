"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLocalEnv = loadLocalEnv;
/**
 * Local environment loader for Firebase Functions emulator & scripts.
 * Production (deployed) functions SHOULD NOT rely on dotenv; use:
 *  - firebase functions:config:set for non-secret config values
 *  - Secret Manager via functions v2 or environment variables set in deploy pipeline
 *
 * This file attempts to load .env.local (preferred) then fallback to .env
 * ONLY when running locally (emulator or direct node script). It is safe to import
 * at top of entrypoints (index.ts, notifier.ts, test scripts) because in production
 * the files will not exist and dotenv will silently ignore.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let loaded = false;
function loadLocalEnv() {
    if (loaded)
        return; // idempotent
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST;
    const isLocal = !process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT?.startsWith('demo-');
    // We load for emulator OR if explicitly marked by NODE_ENV=development
    if (!(isEmulator || process.env.NODE_ENV === 'development')) {
        loaded = true;
        return;
    }
    const rootDir = path_1.default.resolve(__dirname, '..');
    const candidates = [
        path_1.default.join(rootDir, '.env.local'),
        path_1.default.join(rootDir, '.env')
    ];
    try {
        // Lazy require dotenv to avoid adding weight if unused
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const dotenv = require('dotenv');
        for (const file of candidates) {
            if (fs_1.default.existsSync(file)) {
                const result = dotenv.config({ path: file });
                if (result.error) {
                    console.warn('[env] Failed loading', file, result.error.message);
                }
                else {
                    console.log('[env] Loaded environment variables from', path_1.default.basename(file));
                    break; // stop after first existing file
                }
            }
        }
    }
    catch (e) {
        console.warn('[env] dotenv not available or failed to load:', e.message);
    }
    loaded = true;
}
// Auto-run on import for convenience
loadLocalEnv();
//# sourceMappingURL=loadEnv.js.map