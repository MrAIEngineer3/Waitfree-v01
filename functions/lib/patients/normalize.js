"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePatientFullName = void 0;
const NAME_WORD_REGEX = /[^\p{L}\p{N}]+/gu;
const toAscii = (value) => value.normalize('NFKD').replace(/\p{M}+/gu, '');
const normalizePatientFullName = (name) => {
    const ascii = toAscii(name.trim().toLowerCase());
    const collapsed = ascii.replace(NAME_WORD_REGEX, ' ').trim();
    return collapsed.replace(/\s+/g, ' ');
};
exports.normalizePatientFullName = normalizePatientFullName;
//# sourceMappingURL=normalize.js.map