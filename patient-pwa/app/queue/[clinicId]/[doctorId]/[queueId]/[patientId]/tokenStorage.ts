export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface EnsurePatientTokenParams {
  patientId: string;
  storage: StorageLike;
  locationUrl: URL;
  replaceUrl: (cleanedPath: string) => void;
}

const TOKEN_PARAM = 't';

export function ensurePatientToken({
  patientId,
  storage,
  locationUrl,
  replaceUrl
}: EnsurePatientTokenParams): string | null {
  const storageKey = `patientToken:${patientId}`;
  const existing = storage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const urlToken = locationUrl.searchParams.get(TOKEN_PARAM);
  if (!urlToken) {
    return null;
  }

  storage.setItem(storageKey, urlToken);
  locationUrl.searchParams.delete(TOKEN_PARAM);
  const cleanedPath =
    locationUrl.pathname +
    (locationUrl.search ? `?${locationUrl.searchParams.toString()}` : '') +
    locationUrl.hash;
  replaceUrl(cleanedPath);
  return urlToken;
}
