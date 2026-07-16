import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  NIDO_TIME_ZONE,
  SUPPORTED_CURRENCY_CODES,
  type NidoTimeZone,
  type SupportedCurrencyCode,
} from '../src/index.js';

describe('domain constants', () => {
  it('defines only the currencies supported by the MVP', () => {
    expect(SUPPORTED_CURRENCY_CODES).toEqual(['PYG', 'USD']);
    expectTypeOf<SupportedCurrencyCode>().toEqualTypeOf<'PYG' | 'USD'>();
  });

  it('defines the canonical Nido time zone', () => {
    expect(NIDO_TIME_ZONE).toBe('America/Asuncion');
    expectTypeOf<NidoTimeZone>().toEqualTypeOf<'America/Asuncion'>();
  });
});
