import type {
  FrequencyKind,
  Occurrence,
  OccurrenceStatus,
  RecurringItem,
  RecurringItemKind,
  TransactionCurrency,
} from '@nido/contracts';

import {
  formatDecimalEs,
  formatFullLocalDate,
  formatMonthLabel,
  formatPygMagnitude,
  HOUSEHOLD_TIMEZONE,
  monthFromLocalDate,
} from './movement-format';

// FIJ-01/03: an occurrence whose PENDING due date is within this many days reads as "próximo"
// (amber "Vence en N días") rather than a plain neutral "pendiente". Matches the design caption
// ("próximo (badge ámbar, vence en ≤ 3 días)").
export const UPCOMING_WINDOW_DAYS = 3;

/**
 * The four presentation states FIJ-01 groups occurrences into, derived from the persisted
 * `OccurrenceStatus` plus proximity to today. `SKIPPED` is kept distinct so callers can drop it
 * from the visible list (no design surface shows skipped occurrences yet).
 */
export type OccurrenceDisplayStatus = 'OVERDUE' | 'UPCOMING' | 'PENDING' | 'SETTLED' | 'SKIPPED';

export type FijoTone = 'danger' | 'warning' | 'neutral' | 'success';

function localDateToUtcMillis(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

const MILLISECONDS_PER_DAY = 86_400_000;

/** Whole days from `todayLocal` until `dueDate` (negative when the due date is already past). */
export function daysUntilDue(dueDate: string, todayLocal: string): number {
  return Math.round(
    (localDateToUtcMillis(dueDate) - localDateToUtcMillis(todayLocal)) / MILLISECONDS_PER_DAY,
  );
}

/** `yyyy-MM-dd` in the household timezone for an ISO instant — mirrors how the API derives dates. */
export function localDateFromInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOUSEHOLD_TIMEZONE }).format(new Date(iso));
}

/**
 * Collapses the persisted status plus the due-date proximity into the presentation state FIJ-01
 * renders. A `PENDING` occurrence whose due date is already past is shown as `OVERDUE` even before
 * the server's lazy-on-read sweep has flipped it, so the list never shows a stale "pendiente".
 */
export function deriveOccurrenceDisplayStatus(
  occurrence: Pick<Occurrence, 'status' | 'dueDate'>,
  todayLocal: string,
): OccurrenceDisplayStatus {
  switch (occurrence.status) {
    case 'SETTLED':
      return 'SETTLED';
    case 'SKIPPED':
      return 'SKIPPED';
    case 'OVERDUE':
      return 'OVERDUE';
    case 'PENDING': {
      const days = daysUntilDue(occurrence.dueDate, todayLocal);
      if (days < 0) return 'OVERDUE';
      if (days <= UPCOMING_WINDOW_DAYS) return 'UPCOMING';
      return 'PENDING';
    }
  }
}

/** "sáb 5 jul" — lowercase weekday/day/month, no year (FIJ-01/03/04 due-date captions). */
export function formatShortDueDate(localDate: string): string {
  return formatFullLocalDate(localDate).replace(/\s\d{4}$/u, '');
}

/** "Vence hoy" / "Vence mañana" / "Vence en N días" — the amber "próximo" chip copy. */
export function dueInWords(days: number): string {
  if (days <= 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `Vence en ${days.toString()} días`;
}

export interface OccurrenceStatusChip {
  readonly label: string;
  readonly tone: FijoTone;
}

/** The status chip shown on FIJ-03's hero and reused as FIJ-01's amber "próximo" badge. */
export function occurrenceStatusChip(
  status: OccurrenceDisplayStatus,
  dueDate: string,
  todayLocal: string,
): OccurrenceStatusChip {
  switch (status) {
    case 'OVERDUE':
      return { label: `Vencido · era el ${formatShortDueDate(dueDate)}`, tone: 'danger' };
    case 'UPCOMING':
      return {
        label: `${dueInWords(daysUntilDue(dueDate, todayLocal))} · ${formatShortDueDate(dueDate)}`,
        tone: 'warning',
      };
    case 'SETTLED':
      return { label: 'Pagado', tone: 'success' };
    case 'SKIPPED':
      return { label: 'Omitido', tone: 'neutral' };
    case 'PENDING':
      return { label: `Vence ${formatShortDueDate(dueDate)}`, tone: 'neutral' };
  }
}

/**
 * "Pagado el vie 3 jul" (or "Recibido el …" for an income recurring item — kept parameterized so
 * T-508's Ingresos esperados can reuse this verbatim). Falls back to the due date if `settledAt`
 * is somehow absent.
 */
export function settledOnLabel(
  occurrence: Pick<Occurrence, 'settledAt' | 'dueDate'>,
  kind: RecurringItemKind = 'EXPENSE',
): string {
  const localDate =
    occurrence.settledAt === null ? occurrence.dueDate : localDateFromInstant(occurrence.settledAt);
  return `${settledVerb(kind)} el ${formatShortDueDate(localDate)}`;
}

/** "Pagado" for an expense, "Recibido" for an income (T-508 reuse). */
export function settledVerb(kind: RecurringItemKind): string {
  return kind === 'INCOME' ? 'Recibido' : 'Pagado';
}

/** "Mensual" / "Anual" / "Una vez" / "Cada N meses" — recurrence chip + config-row label. */
export function frequencyLabel(
  frequency: FrequencyKind,
  intervalMonths: number | null | undefined,
): string {
  switch (frequency) {
    case 'ONE_TIME':
      return 'Una vez';
    case 'MONTHLY':
      return 'Mensual';
    case 'YEARLY':
      return 'Anual';
    case 'EVERY_N_MONTHS':
      return `Cada ${(intervalMonths ?? 0).toString()} meses`;
  }
}

/** Day-of-month (1–31) encoded in a `yyyy-MM-dd` first-due date. */
export function dayOfMonth(localDate: string): number {
  return Number(localDate.split('-')[2] ?? '1');
}

/** "Mensual · el día 5" / "Cada 2 meses · el día 5" / "Anual · 5 jul" — FIJ-03 "Recurrencia" row. */
export function recurrenceDetailLabel(
  item: Pick<RecurringItem, 'frequency' | 'intervalMonths' | 'firstDueDate'>,
): string {
  switch (item.frequency) {
    case 'MONTHLY':
      return `Mensual · el día ${dayOfMonth(item.firstDueDate).toString()}`;
    case 'EVERY_N_MONTHS':
      return `Cada ${(item.intervalMonths ?? 0).toString()} meses · el día ${dayOfMonth(item.firstDueDate).toString()}`;
    case 'YEARLY':
      return `Anual · ${formatShortDueDate(item.firstDueDate)}`;
    case 'ONE_TIME':
      return `Una vez · ${formatShortDueDate(item.firstDueDate)}`;
  }
}

/** "Fijo mensual · julio 2026" — FIJ-03 hero subheader. */
export function occurrenceSubheader(
  item: Pick<RecurringItem, 'frequency' | 'intervalMonths'>,
  occurrence: Pick<Occurrence, 'dueDate'>,
  kind: RecurringItemKind = 'EXPENSE',
): string {
  const noun = kind === 'INCOME' ? 'Ingreso fijo' : 'Fijo';
  const freq = frequencyLabel(item.frequency, item.intervalMonths).toLowerCase();
  const month = formatMonthLabel(monthFromLocalDate(occurrence.dueDate)).toLowerCase();
  return `${noun} ${freq} · ${month}`;
}

// FIJ-02 "Avisos" chips. `notificationOffsets` is saved but sends nothing yet (M7); the field is
// still shown per the design.
export const NOTIFICATION_OFFSET_OPTIONS = [
  { value: 0, label: 'El mismo día' },
  { value: 1, label: '1 día antes' },
  { value: 3, label: '3 días antes' },
  { value: 7, label: '7 días antes' },
] as const;

/** "el mismo día" / "1 día antes" / "N días antes" — single-offset copy. */
export function notificationOffsetLabel(offset: number): string {
  if (offset === 0) return 'el mismo día';
  if (offset === 1) return '1 día antes';
  return `${offset.toString()} días antes`;
}

function joinWithY(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1] ?? ''}`;
}

/** "3 días antes y el mismo día" — FIJ-03 "Avisos" row; "—" when none are configured. */
export function avisosLabel(offsets: readonly number[]): string {
  if (offsets.length === 0) return '—';
  const sorted = [...offsets].sort((a, b) => b - a);
  const joined = joinWithY(sorted.map(notificationOffsetLabel));
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Integer digits of a wire decimal amount, ignoring any fractional part (PYG is scale 0). */
function integerDigits(amount: string): string {
  return amount.split('.')[0] ?? '0';
}

/** "Gs. 2.800.000" for a PYG amount, "USD 45,90" for a USD amount (design shows PYG only). */
export function formatOccurrenceAmount(amount: string, currency: TransactionCurrency): string {
  if (currency === 'USD') {
    return `USD ${formatDecimalEs(amount, 2)}`;
  }
  return `Gs. ${formatPygMagnitude(integerDigits(amount))}`;
}

/**
 * Total estimated PYG still owed this month — the sum of every non-settled, non-skipped PYG
 * occurrence's amount, as a decimal(18,0) string (BigInt, since it can exceed
 * `Number.MAX_SAFE_INTEGER`). USD occurrences are excluded: mixing currencies into one Gs. total
 * is meaningless and no design surface shows a USD fixed expense.
 */
export function sumPendingEstimatedPyg(
  occurrences: readonly Pick<Occurrence, 'status' | 'currency' | 'amount'>[],
): string {
  const total = occurrences.reduce((accumulator, occurrence) => {
    if (
      occurrence.status === 'SETTLED' ||
      occurrence.status === 'SKIPPED' ||
      occurrence.currency !== 'PYG'
    ) {
      return accumulator;
    }
    return accumulator + BigInt(integerDigits(occurrence.amount));
  }, 0n);
  return total.toString();
}

/** Whether an occurrence still awaits settlement (drives FIJ-01's "N de M fijos" pending count). */
export function isPending(status: OccurrenceStatus): boolean {
  return status === 'PENDING' || status === 'OVERDUE';
}
