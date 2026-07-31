import { describe, expect, it } from 'vitest';

import {
  DAY_OF_MONTH_OPTIONS,
  firstDayOffset,
  formatCalendarMonthLabel,
  formatLocalDatePickerLabel,
  monthlyFirstDueDate,
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

  it('keeps recurring due dates valid when the selected day is absent from the month', () => {
    expect(monthlyFirstDueDate(31, '2026-02-01')).toBe('2026-02-28');
    expect(monthlyFirstDueDate(31, '2026-07-31')).toBe('2026-07-31');
    expect(monthlyFirstDueDate(15, '2026-07-20')).toBe('2026-08-15');
  });
});
