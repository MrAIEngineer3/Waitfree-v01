const NAME_WORD_REGEX = /[^\p{L}\p{N}]+/gu;

const toAscii = (value: string): string => value.normalize('NFKD').replace(/\p{M}+/gu, '');

export const normalizePatientFullName = (name: string): string => {
  const ascii = toAscii(name.trim().toLowerCase());
  const collapsed = ascii.replace(NAME_WORD_REGEX, ' ').trim();
  return collapsed.replace(/\s+/g, ' ');
};
