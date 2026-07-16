import { describe, expect, it } from 'vitest';

import { HealthController } from '../src/health/health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController();

  it('returns a deterministic liveness response', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('returns a deterministic readiness response', () => {
    expect(controller.ready()).toEqual({ status: 'ok' });
  });
});
