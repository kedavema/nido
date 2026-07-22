import type { Category, Transaction } from '@nido/contracts';

// Movements are always reported in the household's base currency (PYG, per ADR 0001), and
// households operate on Paraguay time — see docs/system-design.md and CreateHouseholdRequestSchema
// (baseCurrency is a fixed 'PYG' literal). Server-derived `localDate` values are computed against
// this timezone, so "today"/"yesterday" comparisons must use it too, not the device's timezone.
export const HOUSEHOLD_TIMEZONE = 'America/Asuncion';

const MINUS_SIGN = '−';

const WEEKDAY_ABBREVIATIONS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;

const MONTH_ABBREVIATIONS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
] as const;

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export interface MonthValue {
  readonly year: number;
  readonly month: number; // 1-12
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

interface LocalDateParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number;
}

function parseLocalDate(localDate: string): LocalDateParts {
  const [year, month, day] = localDate.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

function weekdayIndex(localDate: string): number {
  const { year, month, day } = parseLocalDate(localDate);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Today's `yyyy-MM-dd` in the household timezone — matches how the API derives `localDate`. */
export function todayLocalDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOUSEHOLD_TIMEZONE }).format(now);
}

/** Previous calendar day for a `yyyy-MM-dd` string, computed without relying on device timezone. */
export function previousLocalDate(localDate: string): string {
  const { year, month, day } = parseLocalDate(localDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear().toString()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** "HOY · MIÉ 15" / "AYER · MAR 14" / "MIÉ 1 JUL" per MOV-01 day-group headings. */
export function formatDayHeading(localDate: string, todayLocal: string): string {
  const { day } = parseLocalDate(localDate);
  const weekday = WEEKDAY_ABBREVIATIONS[weekdayIndex(localDate)] ?? '';

  if (localDate === todayLocal) {
    return `HOY · ${weekday} ${day.toString()}`;
  }
  if (localDate === previousLocalDate(todayLocal)) {
    return `AYER · ${weekday} ${day.toString()}`;
  }

  const { month } = parseLocalDate(localDate);
  return `${weekday} ${day.toString()} ${MONTH_ABBREVIATIONS[month - 1] ?? ''}`;
}

/** "mié 15 jul 2026" — full lowercase local-date label, per MOV-03's "Fecha" row. */
export function formatFullLocalDate(localDate: string): string {
  const { day, month, year } = parseLocalDate(localDate);
  const weekday = (WEEKDAY_ABBREVIATIONS[weekdayIndex(localDate)] ?? '').toLowerCase();
  const monthAbbr = (MONTH_ABBREVIATIONS[month - 1] ?? '').toLowerCase();
  return `${weekday} ${day.toString()} ${monthAbbr} ${year.toString()}`;
}

/** "9:12" — 24h clock in the household timezone, for movement timestamps. */
export function formatOccurredAtTime(occurredAt: string, timeZone = HOUSEHOLD_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).formatToParts(new Date(occurredAt));
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '0';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** "hoy · mié 15 jul, 9:12" / "ayer · mar 14 jul, 18:04" / "mié 1 jul, 9:12" — MOV-03 hero
 * timestamp. No year here (unlike `formatFullLocalDate`'s "Fecha" row below it) — the year is
 * dropped the same way `nuevo-gasto.tsx`'s "Último usado" caption drops it, by stripping the
 * trailing " yyyy" off `formatFullLocalDate`'s output. */
export function formatMovementTimestamp(
  transaction: Pick<Transaction, 'localDate' | 'occurredAt'>,
  todayLocal: string,
): string {
  const time = formatOccurredAtTime(transaction.occurredAt);
  const dateWithoutYear = formatFullLocalDate(transaction.localDate).replace(/\s\d{4}$/u, '');
  if (transaction.localDate === todayLocal) {
    return `hoy · ${dateWithoutYear}, ${time}`;
  }
  if (transaction.localDate === previousLocalDate(todayLocal)) {
    return `ayer · ${dateWithoutYear}, ${time}`;
  }
  return `${dateWithoutYear}, ${time}`;
}

/** "hoy" / "ayer" / "1 jul" — INI-02's compact date caption for a "Recientes" row. */
export function formatRecentMovementDateLabel(localDate: string, todayLocal: string): string {
  if (localDate === todayLocal) {
    return 'hoy';
  }
  if (localDate === previousLocalDate(todayLocal)) {
    return 'ayer';
  }
  const { day, month } = parseLocalDate(localDate);
  return `${day.toString()} ${(MONTH_ABBREVIATIONS[month - 1] ?? '').toLowerCase()}`;
}

/** Inserts `.` thousand separators into an unsigned integer digit string. */
export function formatPygMagnitude(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
}

/** "−Gs. 386.500" / "+Gs. 9.500.000" for a single movement, per its type. */
export function formatTransactionAmount(transaction: Pick<Transaction, 'type' | 'baseAmountPyg'>): {
  readonly text: string;
  readonly isPositive: boolean;
} {
  const isPositive = transaction.type === 'INCOME';
  const sign = isPositive ? '+' : MINUS_SIGN;
  return { text: `${sign}Gs. ${formatPygMagnitude(transaction.baseAmountPyg)}`, isPositive };
}

/**
 * Net of a day's movements (income minus expense) in base PYG. Uses BigInt because
 * `baseAmountPyg` is a decimal(18,0) column value (ADR 0001) that can exceed
 * `Number.MAX_SAFE_INTEGER`.
 */
export function sumDailyNetBaseAmountPyg(
  transactions: readonly Pick<Transaction, 'type' | 'baseAmountPyg'>[],
): bigint {
  return transactions.reduce((total, transaction) => {
    const amount = BigInt(transaction.baseAmountPyg);
    return transaction.type === 'INCOME' ? total + amount : total - amount;
  }, 0n);
}

/** "−Gs. 1.111.365" / "+Gs. 17.700.000" for a day-group subtotal. */
export function formatSignedPygAmount(amount: bigint): {
  readonly text: string;
  readonly isPositive: boolean;
} {
  const isPositive = amount >= 0n;
  const magnitude = (isPositive ? amount : -amount).toString();
  const sign = isPositive ? '+' : MINUS_SIGN;
  return { text: `${sign}Gs. ${formatPygMagnitude(magnitude)}`, isPositive };
}

/** "45,90" (fractionDigits=2) or "7.350" (fractionDigits=0) — Spanish decimal comma, no rounding. */
export function formatDecimalEs(value: string, fractionDigits: number): string {
  const [integerPart = '0', fractionPart = ''] = value.split('.');
  const groupedInteger = formatPygMagnitude(integerPart);

  if (fractionDigits <= 0) {
    return groupedInteger;
  }

  const paddedFraction = `${fractionPart}${'0'.repeat(fractionDigits)}`.slice(0, fractionDigits);
  return `${groupedInteger},${paddedFraction}`;
}

export interface DayGroup<T> {
  readonly localDate: string;
  readonly transactions: readonly T[];
  readonly netBaseAmountPyg: bigint;
}

/** Groups movements by `localDate` (newest day first), each day newest movement first. */
export function groupTransactionsByDay<
  T extends Pick<Transaction, 'localDate' | 'occurredAt' | 'type' | 'baseAmountPyg'>,
>(transactions: readonly T[]): readonly DayGroup<T>[] {
  const byDate = new Map<string, T[]>();

  for (const transaction of transactions) {
    const bucket = byDate.get(transaction.localDate);
    if (bucket === undefined) {
      byDate.set(transaction.localDate, [transaction]);
    } else {
      bucket.push(transaction);
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([localDate, items]) => ({
      localDate,
      transactions: [...items].sort((a, b) =>
        a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
      ),
      netBaseAmountPyg: sumDailyNetBaseAmountPyg(items),
    }));
}

/** "Alimentación · Supermercado" for a subcategory, or just "Alimentación" for a root category. */
export function categoryLabel(
  categoryId: string,
  categories: readonly Category[],
): string | undefined {
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (category === undefined) {
    return undefined;
  }
  if (category.parentId === null) {
    return category.name;
  }
  const parent = categories.find((candidate) => candidate.id === category.parentId);
  return parent === undefined ? category.name : `${parent.name} · ${category.name}`;
}

export function monthFromLocalDate(localDate: string): MonthValue {
  const { year, month } = parseLocalDate(localDate);
  return { year, month };
}

/** Inclusive `[from, to]` local-date bounds (yyyy-MM-dd) covering the given calendar month. */
export function monthLocalDateRange({ year, month }: MonthValue): {
  readonly from: string;
  readonly to: string;
} {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const yearText = year.toString();
  return {
    from: `${yearText}-${pad2(month)}-01`,
    to: `${yearText}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

/** "2026-07" — the `month` query param shape for `reports/monthly-summary` (`MonthSchema`). */
export function formatMonthQueryParam({ year, month }: MonthValue): string {
  return `${year.toString()}-${pad2(month)}`;
}

export function shiftMonth({ year, month }: MonthValue, delta: number): MonthValue {
  const totalMonths = year * 12 + (month - 1) + delta;
  return { year: Math.floor(totalMonths / 12), month: (((totalMonths % 12) + 12) % 12) + 1 };
}

/** "Julio 2026" for the month selector header. */
export function formatMonthLabel({ year, month }: MonthValue): string {
  return `${MONTH_NAMES[month - 1] ?? ''} ${year.toString()}`;
}

/** Whole months `to` is chronologically after `from` (negative when `to` is in the past). */
function monthDifference(from: MonthValue, to: MonthValue): number {
  return to.year * 12 + (to.month - 1) - (from.year * 12 + (from.month - 1));
}

/**
 * GLO-03's small gray header subtitle for a month strictly after the real current month (the
 * user paged forward with "Mes siguiente"). `undefined` for the current month or any past month,
 * even one with zero transactions — only a future month gets this line.
 */
export function futureMonthSubtitle(month: MonthValue, todayLocal: string): string | undefined {
  const monthsAhead = monthDifference(monthFromLocalDate(todayLocal), month);
  if (monthsAhead === 1) {
    return 'mes siguiente · aún no empezó';
  }
  if (monthsAhead > 1) {
    return 'aún no empezó';
  }
  return undefined;
}

/** Whether `month` is the real current calendar month (not a past or future one being paged to). */
export function isCurrentMonth(month: MonthValue, todayLocal: string): boolean {
  return monthDifference(monthFromLocalDate(todayLocal), month) === 0;
}

/**
 * INI-02's "quedan N días" header caption — whole days left in the current calendar month,
 * counting today itself as already under way (so the last day of the month reads "quedan 0
 * días"). `undefined` for any month other than the real current one, since the caption only makes
 * sense next to the month you're actually living in.
 */
export function daysRemainingInCurrentMonth(
  month: MonthValue,
  todayLocal: string,
): number | undefined {
  if (!isCurrentMonth(month, todayLocal)) {
    return undefined;
  }
  const { year, day } = parseLocalDate(todayLocal);
  const lastDay = new Date(Date.UTC(year, month.month, 0)).getUTCDate();
  return lastDay - day;
}
