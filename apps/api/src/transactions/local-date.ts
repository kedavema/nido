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
