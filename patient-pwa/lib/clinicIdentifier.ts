const SHARE_CODE_REGEX = /^[A-Z0-9-]{3,16}$/;
const CLINIC_SLUG_REGEX = /^[A-Za-z0-9-_.~]{3,128}$/;

const stripToAllowed = (value: string) => value.match(/[A-Za-z0-9-_.~]+/g)?.join('') ?? '';

export const normalizeClinicShareCode = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const compact = trimmed.replace(/\s+/g, '');
  if (!compact) {
    return null;
  }
  const normalized = compact.toUpperCase();
  return SHARE_CODE_REGEX.test(normalized) ? normalized : null;
};

export const sanitizeClinicSlug = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const cleaned = stripToAllowed(trimmed);
  if (!cleaned) {
    return null;
  }
  return CLINIC_SLUG_REGEX.test(cleaned) ? cleaned : null;
};

export type ClinicIdentifier = {
  shareCode?: string | null;
  clinicId?: string | null;
};

const normalizeIdentifiers = (candidate: ClinicIdentifier): ClinicIdentifier | null => {
  const shareCode = normalizeClinicShareCode(candidate.shareCode ?? null);
  const clinicIdRaw = candidate.clinicId ?? candidate.shareCode;
  const clinicId = sanitizeClinicSlug(clinicIdRaw ?? null);

  if (!shareCode && !clinicId) {
    return null;
  }

  return {
    shareCode: shareCode ?? null,
    clinicId: clinicId ?? (shareCode ?? null),
  };
};

export const parseClinicIdentifierFromQuery = (params: URLSearchParams): ClinicIdentifier | null => {
  const shareCode = normalizeClinicShareCode(
    params.get('code') ?? params.get('clinicCode') ?? params.get('shareCode')
  );
  const clinicId = sanitizeClinicSlug(params.get('clinicId') ?? params.get('c'));
  return normalizeIdentifiers({ shareCode: shareCode ?? undefined, clinicId: clinicId ?? undefined });
};

export type ParseClinicIdentifierOptions = {
  preferSlugOnAmbiguous?: boolean;
};

export const parseClinicIdentifierFromText = (
  input: string,
  options: ParseClinicIdentifierOptions = {}
): ClinicIdentifier | null => {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const fromUrl = parseClinicIdentifierFromQuery(url.searchParams);
    if (fromUrl) {
      return fromUrl;
    }
  } catch {
    // Not a URL; continue with plain parsing.
  }

  if (/[:?=&]/.test(trimmed)) {
    try {
      const qs = trimmed.includes('?') ? trimmed.split('?')[1] : trimmed;
      const params = new URLSearchParams(qs);
      const fromParams = parseClinicIdentifierFromQuery(params);
      if (fromParams) {
        return fromParams;
      }
    } catch {
      // ignore parsing failure, will fall through to plain normalization
    }
  }

  const normalized = normalizeIdentifiers({ shareCode: trimmed, clinicId: trimmed });
  if (!normalized) {
    return null;
  }

  if (options.preferSlugOnAmbiguous) {
    const shareCandidate = normalized.shareCode ?? null;
    const slugCandidate = normalized.clinicId ?? null;
    if (shareCandidate && slugCandidate && shareCandidate.toUpperCase() === slugCandidate.toUpperCase()) {
      return {
        clinicId: slugCandidate,
        shareCode: null,
      };
    }
  }

  return normalized;
};

export const buildJoinHref = (identifier: ClinicIdentifier, basePath = '/join'): string => {
  const params = new URLSearchParams();
  const shareCode = normalizeClinicShareCode(identifier.shareCode ?? null);
  const clinicId = sanitizeClinicSlug(identifier.clinicId ?? null);

  // Use share code as the primary identifier if available, otherwise fall back to clinicId
  const effectiveId = shareCode ?? clinicId;

  if (effectiveId) {
    params.set('clinicId', effectiveId);
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
};

export const formatClinicShareCode = (shareCode: string | null | undefined): string | null => {
  if (!shareCode) {
    return null;
  }
  const normalized = normalizeClinicShareCode(shareCode);
  if (!normalized) {
    return null;
  }
  if (normalized.includes('-')) {
    return normalized;
  }
  return normalized.match(/.{1,4}/g)?.join(' ') ?? normalized;
};
