import { describe, expect, it } from 'vitest';

import {
  deriveLocalDate,
  deriveMonthLocalDateRange,
  formatLocalDate,
  parseLocalDate,
} from '../src/transactions/local-date.js';

// America/Asuncion is currently a fixed UTC-3 offset (no DST), so it is always *behind* UTC.
// That means a local calendar date can only ever roll to the *previous* day relative to UTC
// (early UTC hours), never to the next day (a positive-offset zone would be needed for that).
describe('deriveLocalDate', () => {
  it('keeps the same calendar day when the local time stays within it', () => {
    // 23:30 UTC - 3h = 20:30 local, same day.
    expect(deriveLocalDate(new Date('2026-07-20T23:30:00.000Z'), 'America/Asuncion')).toBe(
      '2026-07-20',
    );
  });

  it('rolls back to the previous local day for an early UTC morning timestamp', () => {
    // 02:00 UTC - 3h = 23:00 the previous local day.
    expect(deriveLocalDate(new Date('2026-07-20T02:00:00.000Z'), 'America/Asuncion')).toBe(
      '2026-07-19',
    );
  });

  it('sits exactly on the UTC-midnight boundary that separates the two local days', () => {
    // 03:00 UTC - 3h = 00:00 local, the first instant of the same UTC calendar day.
    expect(deriveLocalDate(new Date('2026-07-20T03:00:00.000Z'), 'America/Asuncion')).toBe(
      '2026-07-20',
    );
    // One millisecond earlier is still the previous local day.
    expect(deriveLocalDate(new Date('2026-07-20T02:59:59.999Z'), 'America/Asuncion')).toBe(
      '2026-07-19',
    );
  });

  it('derives the correct date in UTC itself (zero offset)', () => {
    expect(deriveLocalDate(new Date('2026-07-20T12:00:00.000Z'), 'UTC')).toBe('2026-07-20');
  });
});

describe('parseLocalDate / formatLocalDate', () => {
  it('round-trips a local date through the UTC-midnight Date representation', () => {
    const date = parseLocalDate('2026-07-19');
    expect(date.toISOString()).toBe('2026-07-19T00:00:00.000Z');
    expect(formatLocalDate(date)).toBe('2026-07-19');
  });

  it('round-trips a date near the turn of the year', () => {
    const date = parseLocalDate('2026-12-31');
    expect(formatLocalDate(date)).toBe('2026-12-31');
  });
});

describe('deriveMonthLocalDateRange', () => {
  it('resolves a 31-day month', () => {
    expect(deriveMonthLocalDateRange('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('resolves a 30-day month', () => {
    expect(deriveMonthLocalDateRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('resolves February in a leap year to 29 days', () => {
    expect(deriveMonthLocalDateRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('resolves February in a non-leap year to 28 days', () => {
    expect(deriveMonthLocalDateRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('resolves December without rolling into the next year', () => {
    expect(deriveMonthLocalDateRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('resolves January without rolling into the previous year', () => {
    expect(deriveMonthLocalDateRange('2027-01')).toEqual({ from: '2027-01-01', to: '2027-01-31' });
  });

  it('rejects a malformed month', () => {
    expect(() => deriveMonthLocalDateRange('2026-13')).toThrow();
    expect(() => deriveMonthLocalDateRange('2026-7')).toThrow();
    expect(() => deriveMonthLocalDateRange('not-a-month')).toThrow();
  });
});
