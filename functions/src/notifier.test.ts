import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

const {
  loggerMock,
  addMock,
  messagesCreateMock,
  twilioFactoryMock
} = vi.hoisted(() => {
  const messagesCreateMock = vi.fn();
  return {
    loggerMock: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    },
    addMock: vi.fn(),
    messagesCreateMock,
    twilioFactoryMock: vi.fn(() => ({ messages: { create: messagesCreateMock } }))
  };
});

vi.mock('./firebaseAdmin', () => ({
  admin: {
    firestore: vi.fn(() => ({
      collection: vi.fn(() => ({ add: addMock }))
    }))
  }
}));

vi.mock('firebase-functions/v1', () => ({
  logger: loggerMock
}));

vi.mock('./utils/phone', async () => {
  const actual = await vi.importActual<typeof import('./utils/phone')>('./utils/phone');
  return {
    ...actual,
    requireNormalizedPhone: vi.fn(actual.requireNormalizedPhone)
  };
});

const envBackup = { ...process.env };

function resetEnv() {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  process.env.PATIENT_PWA_BASE_URL = 'https://demo.waitfreeclinic.com';
}

type SendNotificationFn = typeof import('./notifier')['sendNotification'];
type SetTwilioFactoryForTests = typeof import('./notifier')['__setTwilioFactoryForTests'];

let sendNotification: SendNotificationFn;
let setTwilioFactoryForTests: SetTwilioFactoryForTests;

beforeAll(async () => {
  ({ sendNotification, __setTwilioFactoryForTests: setTwilioFactoryForTests } = await import('./notifier'));
});

describe('notifier', () => {
  beforeEach(() => {
    resetEnv();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
    addMock.mockReset();
    messagesCreateMock.mockReset();
  twilioFactoryMock.mockReset();
    setTwilioFactoryForTests(twilioFactoryMock as any);
  });

  afterAll(() => {
    setTwilioFactoryForTests(null);
    Object.assign(process.env, envBackup);
  });

  it('records a debug notification and returns debug-only when Twilio is not configured', async () => {
    const result = await sendNotification({
      to: '9876543210',
      type: 'joined',
      payload: { name: 'Jane', tokenNumber: 1 }
    });

    expect(result).toEqual({ ok: true, provider: 'debug-only' });
    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({
      to: '9876543210',
      formattedPhone: '+919876543210',
      type: 'joined'
    }));
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Twilio not configured - debug mode only',
      expect.objectContaining({ hasClient: false })
    );
    expect(twilioFactoryMock).not.toHaveBeenCalled();
  });

  it('sends via Twilio when credentials are available', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'sid';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+911234567890';

    messagesCreateMock.mockResolvedValueOnce({ sid: 'messageSid' });

    const result = await sendNotification({ to: '9876543210', type: 'doctor-online', payload: { doctorName: 'Strange' } });

    expect(result).toEqual({ ok: true, provider: 'twilio', sid: 'messageSid' });
    expect(messagesCreateMock).toHaveBeenCalledWith({
      body: expect.stringContaining('Strange is now available'),
      from: 'whatsapp:+911234567890',
      to: 'whatsapp:+919876543210'
    });
    expect(twilioFactoryMock).toHaveBeenCalledTimes(1);
    expect(twilioFactoryMock).toHaveBeenCalledWith('sid', 'token');
  });

  it('reports Twilio errors without throwing', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'sid';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+911234567890';

    messagesCreateMock.mockRejectedValueOnce({ message: 'daily limit reached', code: 12345 });

    const result = await sendNotification({ to: '9876543210', type: 'pos1' });

    expect(result).toEqual({ ok: false, provider: 'twilio', error: 'daily limit reached' });
    expect(loggerMock.error).toHaveBeenCalledWith('Twilio WhatsApp failed', expect.objectContaining({
      error: 'daily limit reached',
      code: 12345
    }));
  });

  it('skips invalid phone numbers', async () => {
    const result = await sendNotification({ to: 'abc', type: 'joined' });

    expect(result).toEqual({ ok: false, error: 'Invalid phone number format' });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Notifier: skipping send due to invalid phone',
      expect.objectContaining({ message: 'Invalid phone number format' })
    );
    expect(addMock).not.toHaveBeenCalled();
  });
});
