import type { MonthlySummaryResponse } from '@nido/contracts';

import type { CachedSummary, SummaryCache } from './summary-cache.types';
import { summaryCacheKey } from './summary-cache.types';

export function getSummaryCache(): SummaryCache {
  return {
    read(householdId, month) {
      const raw = localStorage.getItem(summaryCacheKey(householdId, month));
      if (raw === null) {
        return Promise.resolve(undefined);
      }
      try {
        return Promise.resolve(JSON.parse(raw) as CachedSummary);
      } catch {
        // Malformed/foreign value under this key — treat as no cache rather than throwing.
        return Promise.resolve(undefined);
      }
    },

    write(householdId, month, summary: MonthlySummaryResponse) {
      const entry: CachedSummary = { summary, cachedAt: new Date().toISOString() };
      localStorage.setItem(summaryCacheKey(householdId, month), JSON.stringify(entry));
      return Promise.resolve();
    },
  };
}
