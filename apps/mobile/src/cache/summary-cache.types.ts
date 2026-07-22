import type { MonthlySummaryResponse } from '@nido/contracts';

/**
 * A monthly summary as last successfully fetched, kept locally so a later failed fetch can still
 * show something instead of an empty screen (GLO-02 / docs/system-design.md §6.9: "ante error de
 * API se conserva y muestra el caché local").
 */
export interface CachedSummary {
  readonly summary: MonthlySummaryResponse;
  /** ISO timestamp of when this entry was written, used to render "de {HH:MM}" in the UI. */
  readonly cachedAt: string;
}

/**
 * Platform-agnostic read/write cache for the last successful monthly-summary response, keyed by
 * household id + month. Mirrors the SyncStore platform-split pattern (sync-store.types.ts): a
 * `.web.ts` implementation for web and a default (native) implementation, selected by the bundler
 * via the file extension.
 */
export interface SummaryCache {
  readonly read: (householdId: string, month: string) => Promise<CachedSummary | undefined>;
  readonly write: (
    householdId: string,
    month: string,
    summary: MonthlySummaryResponse,
  ) => Promise<void>;
}

/** `"summary:{householdId}:{month}"` — the cache key shared by every implementation. */
export function summaryCacheKey(householdId: string, month: string): string {
  return `summary:${householdId}:${month}`;
}
