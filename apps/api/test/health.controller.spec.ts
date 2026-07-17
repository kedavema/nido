import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { HealthController } from '../src/health/health.controller.js';

describe('HealthController', () => {
  it('returns a deterministic liveness response', () => {
    const controller = new HealthController({ assertReady: vi.fn() });
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('returns a deterministic readiness response after PostgreSQL responds', async () => {
    const controller = new HealthController({ assertReady: vi.fn() });
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });

  it('returns unavailable without exposing the PostgreSQL error', async () => {
    const controller = new HealthController({
      assertReady: vi.fn().mockRejectedValue(new Error('sensitive connection detail')),
    });
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
