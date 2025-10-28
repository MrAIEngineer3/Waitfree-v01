import { describe, it, expect, vi, beforeEach } from 'vitest';

import { startTiming } from './timing';

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('firebase-functions/v1', () => ({
  logger: loggerMock
}));

describe('timing utility', () => {
  beforeEach(() => {
    loggerMock.info.mockReset();
    loggerMock.error.mockReset();
  });

  it('logs success with merged context when succeed is called', () => {
    const span = startTiming('demo', { clinicId: 'clinic-1' });
    span.succeed({ duration: 'short' });

    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).toHaveBeenCalledWith('[timing] demo completed', expect.objectContaining({
      label: 'demo',
      status: 'success',
      clinicId: 'clinic-1',
      duration: 'short'
    }));
  });

  it('logs error when fail is invoked', () => {
    const span = startTiming('demo');
    span.fail({ reason: 'boom' });

    expect(loggerMock.error).toHaveBeenCalledWith('[timing] demo failed', expect.objectContaining({
      status: 'error',
      reason: 'boom'
    }));
  });

  it('supports manual end with explicit status', () => {
    const span = startTiming('manual', { requestId: 'req-123' });
    span.end('success', { extra: true });

    expect(loggerMock.info).toHaveBeenLastCalledWith(
      '[timing] manual completed',
      expect.objectContaining({ requestId: 'req-123', extra: true })
    );
  });
});
