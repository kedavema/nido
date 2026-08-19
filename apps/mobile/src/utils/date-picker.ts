export interface CalendarMonth {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
}

export interface LocalDateParts extends CalendarMonth {
  readonly day: number;
}

export const DAY_OF_MONTH_OPTIONS: readonly number[] = Array.from(
  { length: 31 },
  (_, index) => index + 1,
);

export const CALENDAR_WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function parseLocalDate(localDate: string): LocalDateParts {
  const [yearValue = 1970, monthValue = 1, dayValue = 1] = localDate.split('-').map(Number);
  const year = Number.isInteger(yearValue) && yearValue > 0 ? yearValue : 1970;
  const month =
    Number.isInteger(monthValue) && monthValue >= 1 && monthValue <= 12 ? monthValue : 1;
  const day = Number.isInteger(dayValue) && dayValue >= 1 && dayValue <= 31 ? dayValue : 1;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthFromLocalDate(localDate: string): CalendarMonth {
  const { year, month } = parseLocalDate(localDate);
  return { year, month };
}

export function shiftCalendarMonth(calendarMonth: CalendarMonth, offset: number): CalendarMonth {
  const shifted = new Date(Date.UTC(calendarMonth.year, calendarMonth.month - 1 + offset, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

export function firstDayOffset(calendarMonth: CalendarMonth): number {
  const sundayFirstIndex = new Date(
    Date.UTC(calendarMonth.year, calendarMonth.month - 1, 1),
  ).getUTCDay();
  return (sundayFirstIndex + 6) % 7;
}

export function localDateFromParts(year: number, month: number, day: number): string {
  return `${year.toString()}-${pad2(month)}-${pad2(day)}`;
}

export function formatLocalDatePickerLabel(localDate: string): string {
  const { day, month } = parseLocalDate(localDate);
  return `El ${day.toString()} de ${MONTH_NAMES[month - 1] ?? MONTH_NAMES[0]}`;
}

export function formatCalendarMonthLabel(calendarMonth: CalendarMonth): string {
  const monthName = MONTH_NAMES[calendarMonth.month - 1] ?? MONTH_NAMES[0];
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${calendarMonth.year.toString()}`;
}

/**
 * First due date for a day-of-month recurrence.
 *
 * Defaults to the next occurrence of that day: a day already gone by this month rolls to the next
 * one, which is what someone adding a bill that starts next month means.
 *
 * `startThisMonth` overrides that for the other real case — registering a rule that already
 * existed, whose payment for this month is already due or paid. The resulting occurrence is born
 * in the past and the daily sweep marks it OVERDUE, which is the intended reading. Nothing in the
 * domain forbids a past `first_due_date` (ADR 0009 generates forward from it), and back-dating
 * cannot fire stale reminders: deliveries are only enqueued inside a `today - 1 .. today` window.
 */
export function monthlyFirstDueDate(
  day: number,
  todayLocal: string,
  startThisMonth = false,
): string {
  const { year, month, day: todayDay } = parseLocalDate(todayLocal);
  const requestedDay = Math.min(Math.max(Math.trunc(day), 1), 31);
  const targetMonth =
    requestedDay < todayDay && !startThisMonth
      ? shiftCalendarMonth({ year, month }, 1)
      : { year, month };
  const dueDay = Math.min(requestedDay, daysInMonth(targetMonth.year, targetMonth.month));
  return localDateFromParts(targetMonth.year, targetMonth.month, dueDay);
}
