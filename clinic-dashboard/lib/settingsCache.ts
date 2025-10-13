export interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const pendingLoads = new Map<string, Promise<void>>();
const ONE_MINUTE = 60_000;

function makeKey(pathSegments: string[]): string {
  return pathSegments.join('/');
}

export function getCachedValue<T>(pathSegments: string[]): T | undefined {
  const key = makeKey(pathSegments);
  const entry = dataCache.get(key);
  return (entry?.value as T | undefined);
}

export function setCachedValue<T>(pathSegments: string[], value: T): void {
  const key = makeKey(pathSegments);
  dataCache.set(key, { value, fetchedAt: Date.now() });
}

export async function prefetchValue<T>(
  pathSegments: string[],
  loader: () => Promise<T>,
  options: { freshMs?: number } = {}
): Promise<T> {
  const key = makeKey(pathSegments);
  const existing = dataCache.get(key);
  const maxAge = options.freshMs ?? ONE_MINUTE;

  if (existing && Date.now() - existing.fetchedAt <= maxAge) {
    return existing.value as T;
  }

  const inFlight = pendingLoads.get(key);
  if (inFlight) {
    await inFlight;
    const latest = dataCache.get(key);
    return (latest?.value as T) ?? (existing?.value as T);
  }

  const task = (async () => {
    try {
      const value = await loader();
      dataCache.set(key, { value, fetchedAt: Date.now() });
    } finally {
      pendingLoads.delete(key);
    }
  })();

  pendingLoads.set(key, task);
  await task;
  const latest = dataCache.get(key);
  return latest?.value as T;
}

export function clearClinicCache(clinicId: string): void {
  const prefix = `clinics/${clinicId}`;
  for (const key of dataCache.keys()) {
    if (key.startsWith(prefix)) {
      dataCache.delete(key);
    }
  }
}

export function primeCache<T>(pathSegments: string[], value: T): void {
  const key = makeKey(pathSegments);
  if (!dataCache.has(key)) {
    dataCache.set(key, { value, fetchedAt: Date.now() });
  }
}
