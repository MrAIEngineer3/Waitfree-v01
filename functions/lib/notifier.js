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
exports.sendNotification = sendNotification;
exports.setStaffClaim = setStaffClaim;
const firestore_1 = require("@google-cloud/firestore");
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
// Single exported sendNotification used by functions. Currently logs via functions.logger
// Replace with real provider integration (Twilio, WhatsApp, etc.) using env vars/Secret Manager.
async function sendNotification(opts) {
    try {
        functions.logger.info('Notifier: sending', { to: opts.to, type: opts.type, payload: opts.payload });
        // For local development/emulator: record the notification in a debug collection
        try {
            const db = admin.firestore();
            await db.collection('debugNotifications').add({
                to: opts.to,
                type: opts.type,
                payload: opts.payload || null,
                createdAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        catch (e) {
            // If Firestore isn't available or write fails, just log and continue.
            functions.logger.warn('Failed to write debug notification to Firestore', e);
        }
        // No-op provider integration for now.
        return { ok: true };
    }
    catch (err) {
        functions.logger.error('Notifier failed', err);
        return { ok: false, error: String(err) };
    }
}
// Optional admin helper for programmatic staff claim setting. Keep here so functions can reuse it if needed.
async function setStaffClaim(uid, isStaff) {
    try {
        await admin.auth().setCustomUserClaims(uid, { staff: isStaff });
        return { success: true };
    }
    catch (err) {
        functions.logger.error('setStaffClaim error', err);
        throw err;
    }
}
exports.default = { sendNotification, setStaffClaim };
//# sourceMappingURL=notifier.js.map