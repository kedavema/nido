/**
 * Derives the household-local calendar date (`YYYY-MM-DD`) that `occurredAt` falls on in
 * `timeZone`, per ADR 0007. The monorepo has no date-arithmetic library dependency (mobile
 * only uses `Intl.DateTimeFormat` for display formatting, see
 * `apps/mobile/src/app/(tabs)/mas.tsx`), so this uses the platform `Intl` API rather than
 * adding one. `formatToParts` (not `format`) is used so the result does not depend on a
 * locale's chosen separators or field order.
 */
export function deriveLocalDate(occurredAt: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(occurredAt);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Unable to derive a local date for timezone "${timeZone}"`);
  }

  return `${year}-${month}-${day}`;
}

/**
 * Parses a `YYYY-MM-DD` local date into the UTC-midnight `Date` that Prisma expects for a
 * `@db.Date` column (Postgres `DATE` has no time zone; Prisma round-trips it as a `Date`
 * pinned to UTC midnight).
 */
export function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid local date "${localDate}"`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/** Formats a `@db.Date` column value (UTC-midnight `Date`) back into `YYYY-MM-DD`. */
export function formatLocalDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolves a `YYYY-MM` month (per `reports/monthly-summary`, see ADR 0007) to the first and last
 * `local_date` values it covers. No household timezone lookup is needed here, unlike
 * `deriveLocalDate`: `local_date` already encodes the household-local calendar day at write
 * time, so a month's boundaries are the same calendar dates regardless of which timezone
 * produced them — this only needs plain calendar arithmetic, done with the same UTC-midnight
 * `Date` convention `parseLocalDate`/`formatLocalDate` use for `@db.Date` columns.
 */
export function deriveMonthLocalDateRange(month: string): { from: string; to: string } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(month);
  const yearText = match?.[1];
  const monthText = match?.[2];
  if (yearText === undefined || monthText === undefined) {
    throw new Error(`Invalid month "${month}"`);
  }

  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1));
  // Day 0 of the following month is the last day of this month.
  const to = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { from: formatLocalDate(from), to: formatLocalDate(to) };
}
