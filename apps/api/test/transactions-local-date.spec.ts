import { describe, expect, it } from 'vitest';

import {
  deriveLocalDate,
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
