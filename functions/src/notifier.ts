// Load local env for emulator
import * as functions from 'firebase-functions/v1';
import './loadEnv';
import { admin } from './firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { requireNormalizedPhone, PhoneNormalizationError } from './utils/phone';

// Import Twilio for WhatsApp integration
type TwilioModule = typeof import('twilio');
type TwilioClient = ReturnType<TwilioModule>;

let twilioFactory: TwilioModule | null = null;
let twilioClient: TwilioClient | null = null;

function resolveTwilioFactory(): TwilioModule | null {
  if (twilioFactory) {
    return twilioFactory;
  }
  try {
    twilioFactory = require('twilio') as TwilioModule;
    return twilioFactory;
  } catch (err) {
    functions.logger.debug('Twilio SDK unavailable or not installed', err);
    return null;
  }
}

// Exposed for tests to inject a stubbed Twilio factory without touching runtime code.
export function __setTwilioFactoryForTests(factory: TwilioModule | null) {
  twilioFactory = factory;
  twilioClient = null;
}

// Notification types used by functions. Add granular stages so server can record which
// per-patient stage notifications were already emitted.
type NotifyType = 'joined' | 'three-away' | 'two-away' | 'one-away' | 'now' | 'cancelled' | 'completed' | 'pos1' | 'pos2' | 'pos3' | 'doctor-online';

interface NotifyOpts {
  to: string; // phone number or identifier
  type: NotifyType;
  payload?: Record<string, any>;
}

// Resolve Patient PWA base URL from environment variables
function getPatientPwaBaseUrl(): string {
  // Priority: process.env (dotenv/emulator or CI). If missing, fall back to '' and omit link.
  const envVal = process.env.PATIENT_PWA_BASE_URL;
  if (envVal && envVal.trim().length > 0) return envVal.trim();
  return '';
}

// Create WhatsApp message content based on notification type
function createWhatsAppMessage(type: NotifyType, payload: any): string {
  const name = payload?.name || 'Patient';
  const token = payload?.tokenNumber || 'N/A';
  const eta = payload?.etaMinutes;
  // const position = payload?.patientsAhead;
  const baseUrl = getPatientPwaBaseUrl();
  const patientLink = (() => {
    try {
      if (!baseUrl) return '';
      const { clinicId, doctorId, queueId, patientId, accessToken } = payload || {};
      if (!clinicId || !doctorId || !queueId || !patientId || !accessToken) return '';
      const url = new URL(`/queue/${clinicId}/${doctorId}/${queueId}/${patientId}`, baseUrl);
      url.searchParams.set('t', String(accessToken));
      return `\nCheck status: ${url.toString()}`;
    } catch {
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

  if (twilioClient) {
    return twilioClient;
  }

  const factory = resolveTwilioFactory();
  if (!factory) {
    return null;
  }
  twilioClient = factory(accountSid, authToken);
  return twilioClient;
}

// Single exported sendNotification used by functions.
// Supports both debug mode (local testing) and production WhatsApp via Twilio
export async function sendNotification(opts: NotifyOpts) {
  try {
    const messageContent = createWhatsAppMessage(opts.type, opts.payload);
    let formattedPhone: string;
    try {
      formattedPhone = requireNormalizedPhone(opts.to);
    } catch (error) {
      const message = error instanceof PhoneNormalizationError ? error.message : 'Invalid phone number';
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
      const db = admin.firestore();
      await db.collection('debugNotifications').add({
        to: opts.to,
        formattedPhone: formattedPhone,
        type: opts.type,
        message: messageContent,
        payload: opts.payload || null,
  createdAt: Timestamp.now(),
        twilioAttempted: !!getTwilioClient()
      });
    } catch (e) {
      functions.logger.warn('Failed to write debug notification to Firestore', e);
    }

    const normalizeFlag = (value?: string | null) => {
      if (!value) {
        return false;
      }
      const normalized = value.toLowerCase();
      return !['0', 'false', ''].includes(normalized);
    };

    const disableTwilioEnv = process.env.NOTIFIER_DISABLE_TWILIO;
    const hasExplicitDisable = disableTwilioEnv !== undefined;
    const explicitDisable = normalizeFlag(disableTwilioEnv);
    const emulatorIndicators = [
      process.env.FUNCTIONS_EMULATOR,
      process.env.FIREBASE_AUTH_EMULATOR_HOST,
      process.env.FIRESTORE_EMULATOR_HOST,
      process.env.FIREBASE_STORAGE_EMULATOR_HOST,
      process.env.FIREBASE_EMULATOR_HUB
    ];
    const runningInEmulator = emulatorIndicators.some((value) => normalizeFlag(value));
    const isTwilioDisabled = hasExplicitDisable ? explicitDisable : runningInEmulator;

    if (isTwilioDisabled) {
      functions.logger.info('Twilio send skipped for local execution', {
        to: formattedPhone,
        type: opts.type,
        reason: hasExplicitDisable ? 'NOTIFIER_DISABLE_TWILIO' : 'FUNCTIONS_EMULATOR'
      });

      return { ok: true, provider: 'disabled' };
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
      } catch (twilioErr: any) {
        functions.logger.error('Twilio WhatsApp failed', {
          error: twilioErr.message,
          code: twilioErr.code,
          to: formattedPhone,
          type: opts.type
        });

        // Don't throw error - notification was logged to debug collection
        return { ok: false, provider: 'twilio', error: twilioErr.message };
      }
    } else {
      functions.logger.info('Twilio not configured - debug mode only', {
        hasClient: !!client,
        hasFromNumber: !!twilioFromNumber,
        to: formattedPhone
      });

      return { ok: true, provider: 'debug-only' };
    }
  } catch (err) {
    functions.logger.error('Notifier failed', err);
    return { ok: false, error: String(err) };
  }
}

export default { sendNotification };
