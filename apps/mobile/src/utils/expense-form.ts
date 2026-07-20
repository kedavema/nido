import type { Category, CategoryKind, Transaction, TransactionCurrency } from '@nido/contracts';

import { formatPygMagnitude } from './movement-format';

/** Default recency window for "recientes" category chips, per GAS-01's own stated default. */
export const RECENT_CATEGORY_WINDOW_DAYS = 90;

const QUICK_CHIP_LIMIT = 3;

function parseLocalDateParts(localDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = localDate.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Shifts a `yyyy-MM-dd` local date by `deltaDays` (may be negative), without device-timezone drift. */
export function shiftLocalDate(localDate: string, deltaDays: number): string {
  const { year, month, day } = parseLocalDateParts(localDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear().toString()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Turns a user-picked local date into an `occurredAt` instant to submit. When the picked date is
 * today, the actual current instant is used (preserving real submission time). Otherwise, the
 * instant is pinned to 15:00 UTC on that date — solidly midday in America/Asuncion regardless of
 * historical DST offset — so the server's timezone-derived `localDate` always resolves back to
 * the date the user picked, even for backdated entries.
 */
export function localDateToOccurredAt(
  localDate: string,
  todayLocal: string,
  now: () => Date = () => new Date(),
): string {
  if (localDate === todayLocal) {
    return now().toISOString();
  }
  return `${localDate}T15:00:00.000Z`;
}

/**
 * Validates a `yyyy-MM-dd` string denotes a real calendar date (rejecting e.g. `2026-02-30`).
 * `@nido/contracts` doesn't export its `LocalDateSchema` (it's an internal server-derivation
 * detail — `occurredAt` is the only date the client ever sends), so the manual date picker
 * validates its own free-text entry with this instead.
 */
export function isValidLocalDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Keeps only digits (PYG has no fractional unit — ADR 0001 scale 0), no leading zeros. */
export function sanitizePygAmountInput(raw: string): string {
  const digits = raw.replace(/[^\d]/gu, '');
  return digits.replace(/^0+(?=\d)/u, '');
}

/** Keeps digits and a single Spanish decimal comma, capped at 2 fraction digits (ADR 0001 scale 2). */
export function sanitizeUsdAmountInput(raw: string): string {
  const kept = raw.replace(/[^\d,]/gu, '');
  const firstComma = kept.indexOf(',');
  const withSingleComma =
    firstComma === -1
      ? kept
      : kept.slice(0, firstComma + 1) + kept.slice(firstComma + 1).replace(/,/gu, '');
  const [integerPart = '', fractionPart] = withSingleComma.split(',');
  const cleanInteger = integerPart.replace(/^0+(?=\d)/u, '');
  if (fractionPart === undefined) {
    return cleanInteger;
  }
  return `${cleanInteger === '' ? '0' : cleanInteger},${fractionPart.slice(0, 2)}`;
}

export function sanitizeAmountInput(raw: string, currency: TransactionCurrency): string {
  return currency === 'PYG' ? sanitizePygAmountInput(raw) : sanitizeUsdAmountInput(raw);
}

/**
 * Keeps digits and a single Spanish decimal comma, capped at 4 fraction digits —
 * `fxRateToBase` is a decimal(18,4) column (see `FxRateToBaseSchema`), unlike PYG amounts which
 * have no fractional unit. Reusing `sanitizePygAmountInput` here would silently strip the comma
 * and any fraction digits a user types or that a pre-filled rate carries.
 */
export function sanitizeFxRateInput(raw: string): string {
  const kept = raw.replace(/[^\d,]/gu, '');
  const firstComma = kept.indexOf(',');
  const withSingleComma =
    firstComma === -1
      ? kept
      : kept.slice(0, firstComma + 1) + kept.slice(firstComma + 1).replace(/,/gu, '');
  const [integerPart = '', fractionPart] = withSingleComma.split(',');
  const cleanInteger = integerPart.replace(/^0+(?=\d)/u, '');
  if (fractionPart === undefined) {
    return cleanInteger;
  }
  return `${cleanInteger === '' ? '0' : cleanInteger},${fractionPart.slice(0, 4)}`;
}

/** Converts a wire decimal string ("7350" / "7350.0004") into the comma-display sanitized form. */
export function fxRateWireToSanitized(wire: string): string {
  return wire.replace('.', ',');
}

/** "7.350" / "7.350,0004" — grouped-thousands display for the manual exchange-rate field. */
export function formatFxRateDisplay(sanitized: string): string {
  const [integerPart = '', fractionPart] = sanitized.split(',');
  const groupedInteger = integerPart === '' ? '' : formatPygMagnitude(integerPart);
  return fractionPart === undefined
    ? groupedInteger
    : `${groupedInteger === '' ? '0' : groupedInteger},${fractionPart}`;
}

/** Converts a sanitized fx-rate display value into the decimal-string wire format. */
export function fxRateToWireDecimal(sanitized: string): string {
  return sanitized.replace(',', '.');
}

/** "386.500" / "45,90" — grouped thousands for display, matching GAS-01/GAS-02's big amount readout. */
export function formatAmountDisplay(sanitized: string, currency: TransactionCurrency): string {
  if (currency === 'PYG') {
    return sanitized === '' ? '' : formatPygMagnitude(sanitized);
  }
  const [integerPart = '', fractionPart] = sanitized.split(',');
  const groupedInteger = integerPart === '' ? '' : formatPygMagnitude(integerPart);
  return fractionPart === undefined
    ? groupedInteger
    : `${groupedInteger === '' ? '0' : groupedInteger},${fractionPart}`;
}

/** Converts a sanitized display value into the decimal-string wire format the contract expects. */
export function amountToWireDecimal(sanitized: string, currency: TransactionCurrency): string {
  if (currency === 'PYG') {
    return sanitized;
  }
  return sanitized.replace(',', '.');
}

function decimalStringToScaledBigInt(value: string, scale: number): bigint {
  const [integerPart = '0', fractionPart = ''] = value.split('.');
  const paddedFraction = `${fractionPart}${'0'.repeat(scale)}`.slice(0, scale);
  const normalizedInteger = integerPart === '' ? '0' : integerPart;
  return (
    BigInt(normalizedInteger) * 10n ** BigInt(scale) +
    BigInt(paddedFraction === '' ? '0' : paddedFraction)
  );
}

/**
 * Live "≈ Gs. X" preview for a USD amount at a given exchange rate — a client-side approximation
 * only (per ADR 0001 the server is the authority on `baseAmountPyg`), but it uses the same
 * half-up rounding rule so the preview matches what the server will persist. `amountUsd` is a
 * decimal string with up to 2 fraction digits; `fxRateToBase` a decimal string with up to 4.
 */
export function previewUsdToBasePyg(amountUsd: string, fxRateToBase: string): string {
  const amountCents = decimalStringToScaledBigInt(amountUsd, 2);
  const fxRateScaled = decimalStringToScaledBigInt(fxRateToBase, 4);
  const numerator = amountCents * fxRateScaled; // scale 6 (2 + 4)
  const divisor = 1_000_000n; // 10^6, to bring the product back to scale 0
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  const roundedUp = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return roundedUp.toString();
}

export interface RecentUsdRate {
  readonly fxRateToBase: string;
  readonly localDate: string;
}

/** Most recent USD transaction's exchange rate — the client-derived "último tipo de cambio usado". */
export function mostRecentUsdRate(
  transactions: readonly Pick<
    Transaction,
    'currency' | 'fxRateToBase' | 'occurredAt' | 'localDate'
  >[],
): RecentUsdRate | undefined {
  let latest: (RecentUsdRate & { readonly occurredAt: string }) | undefined;
  for (const transaction of transactions) {
    if (transaction.currency !== 'USD' || transaction.fxRateToBase === null) {
      continue;
    }
    if (latest === undefined || transaction.occurredAt > latest.occurredAt) {
      latest = {
        fxRateToBase: transaction.fxRateToBase,
        localDate: transaction.localDate,
        occurredAt: transaction.occurredAt,
      };
    }
  }
  return latest === undefined
    ? undefined
    : { fxRateToBase: latest.fxRateToBase, localDate: latest.localDate };
}

function rootCategoryId(categoryId: string, categories: readonly Category[]): string {
  const category = categories.find((candidate) => candidate.id === categoryId);
  return category?.parentId ?? categoryId;
}

/**
 * Root category ids used within the last `windowDays` days, most-frequent first, capped to 3 —
 * GAS-01's "Categoría · recientes" quick chips. Frequency is counted per root category (a
 * subcategory pick counts toward its parent) since the quick chips always show root names.
 */
export function recentRootCategoryIds(
  transactions: readonly Pick<Transaction, 'categoryId' | 'localDate'>[],
  categories: readonly Category[],
  kind: CategoryKind,
  todayLocal: string,
  windowDays: number = RECENT_CATEGORY_WINDOW_DAYS,
): readonly string[] {
  const cutoff = shiftLocalDate(todayLocal, -windowDays);
  const eligibleRootIds = new Set(
    categories
      .filter(
        (category) => category.kind === kind && category.isActive && category.parentId === null,
      )
      .map((category) => category.id),
  );
  const frequency = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.localDate < cutoff) {
      continue;
    }
    const rootId = rootCategoryId(transaction.categoryId, categories);
    if (!eligibleRootIds.has(rootId)) {
      continue;
    }
    frequency.set(rootId, (frequency.get(rootId) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, QUICK_CHIP_LIMIT)
    .map(([id]) => id);
}

/**
 * Payment source ids used most often across all recorded transactions, capped to 3 — GAS-07's
 * "Pagado con · favoritos" quick chips (all-time frequency, per the design's own definition, no
 * recency window unlike categories).
 */
export function favoritePaymentSourceIds(
  transactions: readonly Pick<Transaction, 'paymentSourceId'>[],
  activePaymentSourceIds: ReadonlySet<string>,
): readonly string[] {
  const frequency = new Map<string, number>();

  for (const transaction of transactions) {
    if (
      transaction.paymentSourceId === null ||
      !activePaymentSourceIds.has(transaction.paymentSourceId)
    ) {
      continue;
    }
    frequency.set(
      transaction.paymentSourceId,
      (frequency.get(transaction.paymentSourceId) ?? 0) + 1,
    );
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, QUICK_CHIP_LIMIT)
    .map(([id]) => id);
}
