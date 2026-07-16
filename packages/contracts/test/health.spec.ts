import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  HealthLiveResponseSchema,
  HealthReadyResponseSchema,
  type HealthLiveResponse,
  type HealthReadyResponse,
} from '../src/index.js';

describe('health response contracts', () => {
  it.each([HealthLiveResponseSchema, HealthReadyResponseSchema])(
    'accepts only the deterministic success payload',
    (schema) => {
      expect(schema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
      expect(schema.safeParse({ status: 'failed' }).success).toBe(false);
      expect(schema.safeParse({ status: 'ok', timestamp: 1 }).success).toBe(false);
    },
  );

  it('infers narrow response types', () => {
    expectTypeOf<HealthLiveResponse>().toEqualTypeOf<{ status: 'ok' }>();
    expectTypeOf<HealthReadyResponse>().toEqualTypeOf<{ status: 'ok' }>();
  });
});
