"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSecretBuffer = void 0;
const functions = __importStar(require("firebase-functions"));
let secretManagerClient = null;
const secretBufferCache = new Map();
const negativeCache = new Set();
const getSecretManagerClient = async () => {
    if (!secretManagerClient) {
        const { SecretManagerServiceClient } = await Promise.resolve().then(() => __importStar(require('@google-cloud/secret-manager')));
        secretManagerClient = new SecretManagerServiceClient();
    }
    return secretManagerClient;
};
const resolveSecretResourceName = (secretId, projectId) => {
    if (secretId.startsWith('projects/')) {
        return secretId.includes('/versions/') ? secretId : `${secretId}/versions/latest`;
    }
    if (!projectId) {
        return null;
    }
    return `projects/${projectId}/secrets/${secretId}/versions/latest`;
};
const readEnvSecret = (envName) => {
    const value = process.env[envName];
    if (typeof value === 'string' && value.trim().length > 0) {
        const buffer = Buffer.from(value.trim(), 'utf8');
        secretBufferCache.set(envName, buffer);
        return buffer;
    }
    return null;
};
const resolveProjectId = () => {
    return (process.env.SECRET_MANAGER_PROJECT_ID ||
        process.env.SECRET_MANAGER_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        null);
};
const loadSecretBuffer = async (envName) => {
    const cached = secretBufferCache.get(envName);
    if (cached) {
        return cached;
    }
    const fromEnv = readEnvSecret(envName);
    if (fromEnv) {
        return fromEnv;
    }
    if (negativeCache.has(envName)) {
        return null;
    }
    const explicitSecretReference = process.env[`${envName}_SECRET_NAME`] || process.env[`${envName}_SECRET_ID`];
    const projectId = resolveProjectId();
    const secretIdentifier = explicitSecretReference || envName;
    const resourceName = resolveSecretResourceName(secretIdentifier, projectId);
    if (!resourceName) {
        negativeCache.add(envName);
        functions.logger.warn('Secret lookup skipped because projectId is unavailable', {
            envName,
            secretIdentifier
        });
        return null;
    }
    try {
        const client = await getSecretManagerClient();
        const [version] = await client.accessSecretVersion({
            name: resourceName
        });
        const payload = version?.payload?.data;
        if (!payload || payload.length === 0) {
            negativeCache.add(envName);
            functions.logger.error('Secret Manager returned empty payload for secret', {
                envName,
                resourceName
            });
            return null;
        }
        const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
        secretBufferCache.set(envName, buffer);
        return buffer;
    }
    catch (error) {
        negativeCache.add(envName);
        functions.logger.error('Failed to load secret from Secret Manager', {
            envName,
            resourceName,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
};
exports.loadSecretBuffer = loadSecretBuffer;
//# sourceMappingURL=secrets.js.map