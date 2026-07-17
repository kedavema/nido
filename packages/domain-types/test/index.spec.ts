import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  HOUSEHOLD_MEMBER_STATUSES,
  HOUSEHOLD_ROLES,
  NIDO_TIME_ZONE,
  SUPPORTED_CURRENCY_CODES,
  type HouseholdMemberStatus,
  type HouseholdRole,
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

  it('defines only the M1 household roles and membership states', () => {
    expect(HOUSEHOLD_ROLES).toEqual(['OWNER', 'MEMBER']);
    expect(HOUSEHOLD_MEMBER_STATUSES).toEqual(['ACTIVE', 'REMOVED']);
    expectTypeOf<HouseholdRole>().toEqualTypeOf<'OWNER' | 'MEMBER'>();
    expectTypeOf<HouseholdMemberStatus>().toEqualTypeOf<'ACTIVE' | 'REMOVED'>();
  });
});
