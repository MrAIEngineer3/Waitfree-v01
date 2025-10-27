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
// Load local env for emulator
const functions = __importStar(require("firebase-functions/v1"));
require("./loadEnv");
const firebaseAdmin_1 = require("./firebaseAdmin");
const firestore_1 = require("firebase-admin/firestore");
const phone_1 = require("./utils/phone");
let twilioFactory = null;
function resolveTwilioFactory() {
    if (twilioFactory) {
        return twilioFactory;
    }
    try {
        twilioFactory = require('twilio');
        return twilioFactory;
    }
    catch (err) {
        functions.logger.debug('Twilio SDK unavailable or not installed', err);
        return null;
    }
}
// Resolve Patient PWA base URL from environment variables
function getPatientPwaBaseUrl() {
    // Priority: process.env (dotenv/emulator or CI). If missing, fall back to '' and omit link.
    const envVal = process.env.PATIENT_PWA_BASE_URL;
    if (envVal && envVal.trim().length > 0)
        return envVal.trim();
    return '';
}
// Create WhatsApp message content based on notification type
function createWhatsAppMessage(type, payload) {
    const name = payload?.name || 'Patient';
    const token = payload?.tokenNumber || 'N/A';
    const eta = payload?.etaMinutes;
    // const position = payload?.patientsAhead;
    const baseUrl = getPatientPwaBaseUrl();
    const patientLink = (() => {
        try {
            if (!baseUrl)
                return '';
            const { clinicId, doctorId, queueId, patientId, accessToken } = payload || {};
            if (!clinicId || !doctorId || !queueId || !patientId || !accessToken)
                return '';
            const url = new URL(`/queue/${clinicId}/${doctorId}/${queueId}/${patientId}`, baseUrl);
            url.searchParams.set('t', String(accessToken));
            return `\nCheck status: ${url.toString()}`;
        }
        catch {
            return '';
        }
    })();
    switch (type) {
        case 'joined':
            return `Hello ${name}! You've successfully joined the queue with token #${token}. We'll notify you when it's your turn.${patientLink}`;
        case 'pos3':
            return `Hi ${name}, you're 3rd in line (Token #${token}). ${eta ? `Estimated wait: ${eta} minutes.` : 'We\'ll notify you when you\'re closer.'}`;
        case 'pos2':
            return `${name}, you're 2nd in line! (Token #${token}) ${eta ? `Estimated wait: ${eta} minutes.` : 'Almost your turn!'}`;
        case 'pos1':
            return `${name}, you're NEXT in line! (Token #${token}) ${eta ? `Estimated wait: ${eta} minutes.` : 'Please get ready!'}`;
        case 'now':
            return `🔔 ${name}, it's YOUR TURN! Please proceed to the clinic immediately. Token #${token}`;
        case 'completed':
            return `Thank you ${name}! Your visit has been completed. Hope you feel better soon! Token #${token}`;
        case 'cancelled':
            return `${name}, your queue entry (Token #${token}) has been cancelled. If this was a mistake, please contact the clinic.`;
        case 'doctor-online': {
            const doctorName = payload?.doctorName || 'Doctor';
            return `Great news! ${doctorName} is now available. Open the app to join the queue.${patientLink}`;
        }
        default:
            return `${name}, queue update for token #${token}.`;
    }
}
// Initialize Twilio client (only if credentials are available)
function getTwilioClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
        functions.logger.info('Twilio client not configured (missing credentials)');
        return null; // Return null if credentials not available (for testing)
    }
    const factory = resolveTwilioFactory();
    if (!factory) {
        return null;
    }
    return factory(accountSid, authToken);
}
// Single exported sendNotification used by functions.
// Supports both debug mode (local testing) and production WhatsApp via Twilio
async function sendNotification(opts) {
    try {
        const messageContent = createWhatsAppMessage(opts.type, opts.payload);
        let formattedPhone;
        try {
            formattedPhone = (0, phone_1.requireNormalizedPhone)(opts.to);
        }
        catch (error) {
            const message = error instanceof phone_1.PhoneNormalizationError ? error.message : 'Invalid phone number';
            functions.logger.warn('Notifier: skipping send due to invalid phone', {
                to: opts.to,
                type: opts.type,
                message
            });
            return { ok: false, error: message };
        }
        functions.logger.info('Notifier: sending', {
            to: opts.to,
            formatted: formattedPhone,
            type: opts.type,
            message: messageContent,
            payload: opts.payload
        });
        // For local development/emulator: always record in debug collection
        try {
            const db = firebaseAdmin_1.admin.firestore();
            await db.collection('debugNotifications').add({
                to: opts.to,
                formattedPhone: formattedPhone,
                type: opts.type,
                message: messageContent,
                payload: opts.payload || null,
                createdAt: firestore_1.Timestamp.now(),
                twilioAttempted: !!getTwilioClient()
            });
        }
        catch (e) {
            functions.logger.warn('Failed to write debug notification to Firestore', e);
        }
        // Try to send via Twilio WhatsApp if credentials are available
        const client = getTwilioClient();
        const twilioFromNumber = process.env.TWILIO_WHATSAPP_FROM;
        if (client && twilioFromNumber) {
            try {
                const result = await client.messages.create({
                    body: messageContent,
                    from: twilioFromNumber,
                    to: `whatsapp:${formattedPhone}`
                });
                functions.logger.info('Twilio WhatsApp sent successfully', {
                    sid: result.sid,
                    to: formattedPhone,
                    type: opts.type
                });
                return { ok: true, provider: 'twilio', sid: result.sid };
            }
            catch (twilioErr) {
                functions.logger.error('Twilio WhatsApp failed', {
                    error: twilioErr.message,
                    code: twilioErr.code,
                    to: formattedPhone,
                    type: opts.type
                });
                // Don't throw error - notification was logged to debug collection
                return { ok: false, provider: 'twilio', error: twilioErr.message };
            }
        }
        else {
            functions.logger.info('Twilio not configured - debug mode only', {
                hasClient: !!client,
                hasFromNumber: !!twilioFromNumber,
                to: formattedPhone
            });
            return { ok: true, provider: 'debug-only' };
        }
    }
    catch (err) {
        functions.logger.error('Notifier failed', err);
        return { ok: false, error: String(err) };
    }
}
exports.default = { sendNotification };
//# sourceMappingURL=notifier.js.map