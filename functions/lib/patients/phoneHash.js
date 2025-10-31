"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhoneLookupRef = exports.buildPhoneLookupId = exports.computePatientPhoneHash = void 0;
const crypto_1 = __importDefault(require("crypto"));
const firebaseAdmin_1 = require("../firebaseAdmin");
const secrets_1 = require("../secrets");
const constants_1 = require("./constants");
const hashSecretCache = new Map();
const resolveSecretForVersion = async (version) => {
    const cacheKey = version;
    const cached = hashSecretCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const envName = version === 'v1' ? 'PATIENT_PHONE_HASH_SECRET' : `PATIENT_PHONE_HASH_SECRET_${version.toUpperCase()}`;
    const buffer = await (0, secrets_1.loadSecretBuffer)(envName);
    if (!buffer) {
        throw new Error(`Missing phone hash secret for version ${version}. Set ${envName}.`);
    }
    hashSecretCache.set(cacheKey, buffer);
    return buffer;
};
const resolveActiveVersion = () => {
    const env = process.env.PATIENT_PHONE_HASH_ACTIVE_VERSION;
    if (env && env.trim().length > 0) {
        return env.trim();
    }
    return constants_1.PHONE_HASH_DEFAULT_VERSION;
};
const computePatientPhoneHash = async (normalizedPhone, version) => {
    const hashVersion = version ?? resolveActiveVersion();
    const secret = await resolveSecretForVersion(hashVersion);
    const hmac = crypto_1.default.createHmac('sha256', secret);
    hmac.update(normalizedPhone);
    const digest = hmac.digest('hex');
    const lastFour = normalizedPhone.slice(-4);
    const countryCodeMatch = normalizedPhone.match(/^\+(\d{1,4})/);
    return {
        hash: digest,
        version: hashVersion,
        lastFour,
        countryCode: countryCodeMatch ? countryCodeMatch[1] : null
    };
};
exports.computePatientPhoneHash = computePatientPhoneHash;
const buildPhoneLookupId = (clinicId, phoneHash) => {
    return `${clinicId}#${phoneHash.version}#${phoneHash.hash}`;
};
exports.buildPhoneLookupId = buildPhoneLookupId;
const getPhoneLookupRef = (clinicId, phoneHash) => {
    const db = firebaseAdmin_1.admin.firestore();
    return db.collection(constants_1.PATIENT_PHONE_LOOKUP_COLLECTION).doc((0, exports.buildPhoneLookupId)(clinicId, phoneHash));
};
exports.getPhoneLookupRef = getPhoneLookupRef;
//# sourceMappingURL=phoneHash.js.map