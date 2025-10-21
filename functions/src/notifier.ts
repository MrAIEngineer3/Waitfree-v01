// Load local env for emulator
import * as functions from 'firebase-functions/v1';
import './loadEnv';
import { admin } from './firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';

// Import Twilio for WhatsApp integration
type TwilioModule = typeof import('twilio');

let twilioFactory: TwilioModule | null = null;

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

// Notification types used by functions. Add granular stages so server can record which
// per-patient stage notifications were already emitted.
type NotifyType = 'joined' | 'three-away' | 'two-away' | 'one-away' | 'now' | 'cancelled' | 'completed' | 'pos1' | 'pos2' | 'pos3' | 'doctor-online';

interface NotifyOpts {
  to: string; // phone number or identifier
  type: NotifyType;
  payload?: Record<string, any>;
}

// Phone number validation and formatting for WhatsApp
function formatWhatsAppNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it doesn't start with +, assume Indian number and add +91
  if (!cleaned.startsWith('+')) {
    // Remove leading 0 if present (common in Indian numbers)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    cleaned = '+91' + cleaned;
  }
  
  return cleaned;
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

  const factory = resolveTwilioFactory();
  if (!factory) {
    return null;
  }
  return factory(accountSid, authToken);
}

// Single exported sendNotification used by functions.
// Supports both debug mode (local testing) and production WhatsApp via Twilio
export async function sendNotification(opts: NotifyOpts) {
  try {
    const messageContent = createWhatsAppMessage(opts.type, opts.payload);
    const formattedPhone = formatWhatsAppNumber(opts.to);
    
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

// Optional admin helper for programmatic staff claim setting. Keep here so functions can reuse it if needed.
export async function setStaffClaim(uid: string, isStaff: boolean) {
  try {
    await admin.auth().setCustomUserClaims(uid, { staff: isStaff });
    return { success: true };
  } catch (err) {
    functions.logger.error('setStaffClaim error', err);
    throw err;
  }
}

export default { sendNotification, setStaffClaim };
