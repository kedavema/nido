import { describe, expect, it } from 'vitest';

import {
  DAY_OF_MONTH_OPTIONS,
  daysInMonth,
  firstDayOffset,
  formatCalendarMonthLabel,
  formatLocalDatePickerLabel,
  monthlyFirstDueDate,
  parseLocalDate,
  shiftCalendarMonth,
} from './date-picker';

describe('date picker helpers', () => {
  it('offers every valid day-of-month value, including 29, 30, and 31', () => {
    expect(DAY_OF_MONTH_OPTIONS).toHaveLength(31);
    expect(DAY_OF_MONTH_OPTIONS.at(-1)).toBe(31);
  });

  it('formats the compact date trigger without parsing the local date as local time', () => {
    expect(formatLocalDatePickerLabel('2026-07-28')).toBe('El 28 de julio');
  });

  it('formats and shifts calendar months across year boundaries', () => {
    expect(formatCalendarMonthLabel({ year: 2026, month: 7 })).toBe('Julio 2026');
    expect(shiftCalendarMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftCalendarMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
  });

  it('starts the calendar on Monday while keeping Sunday as the last column', () => {
    expect(firstDayOffset({ year: 2026, month: 7 })).toBe(2);
  });

  it('handles leap years and malformed local dates deterministically', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(parseLocalDate('not-a-date')).toEqual({ year: 1970, month: 1, day: 1 });
  });

  it('keeps recurring due dates valid when the selected day is absent from the month', () => {
    expect(monthlyFirstDueDate(31, '2026-02-01')).toBe('2026-02-28');
    expect(monthlyFirstDueDate(31, '2026-07-31')).toBe('2026-07-31');
    expect(monthlyFirstDueDate(15, '2026-07-20')).toBe('2026-08-15');
  });

  it('keeps a past day in the current month when asked to start there', () => {
    // Registering a rule that already existed: its payment for this month is already due, so the
    // occurrence belongs to July and the sweep will mark it OVERDUE.
    expect(monthlyFirstDueDate(15, '2026-07-20', true)).toBe('2026-07-15');
  });

  it('changes nothing when the day has not passed yet', () => {
    // The flag only decides which month a *past* day lands in; a future day is already this month.
    expect(monthlyFirstDueDate(25, '2026-07-20', true)).toBe('2026-07-25');
    expect(monthlyFirstDueDate(25, '2026-07-20', false)).toBe('2026-07-25');
  });

  it('still clamps to the length of the month it starts in', () => {
    expect(monthlyFirstDueDate(31, '2026-02-20', true)).toBe('2026-02-28');
  });
});
