import * as functions from 'firebase-functions';

let secretManagerClient: import('@google-cloud/secret-manager').SecretManagerServiceClient | null = null;
const secretBufferCache = new Map<string, Buffer>();
const negativeCache = new Set<string>();

const getSecretManagerClient = async () => {
  if (!secretManagerClient) {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    secretManagerClient = new SecretManagerServiceClient();
  }
  return secretManagerClient;
};

const resolveSecretResourceName = (secretId: string, projectId: string | null): string | null => {
  if (secretId.startsWith('projects/')) {
    return secretId.includes('/versions/') ? secretId : `${secretId}/versions/latest`;
  }
  if (!projectId) {
    return null;
  }
  return `projects/${projectId}/secrets/${secretId}/versions/latest`;
};

const readEnvSecret = (envName: string): Buffer | null => {
  const value = process.env[envName];
  if (typeof value === 'string' && value.trim().length > 0) {
    const buffer = Buffer.from(value.trim(), 'utf8');
    secretBufferCache.set(envName, buffer);
    return buffer;
  }
  return null;
};

const resolveProjectId = (): string | null => {
  return (
    process.env.SECRET_MANAGER_PROJECT_ID ||
    process.env.SECRET_MANAGER_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    null
  );
};

export const loadSecretBuffer = async (envName: string): Promise<Buffer | null> => {
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
  } catch (error) {
    negativeCache.add(envName);
    functions.logger.error('Failed to load secret from Secret Manager', {
      envName,
      resourceName,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};
