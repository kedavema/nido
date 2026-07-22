import type { CachedSummary, SummaryCache } from './summary-cache.types';
import { summaryCacheKey } from './summary-cache.types';

// Native default implementation. Unlike sync-store.ts (which persists real offline mutations to
// SQLite), this cache is a read-through convenience for GLO-02's "show the last successful
// fetch" UI, not a durability guarantee — so an in-memory Map is a deliberate stand-in for now.
// It resets on app restart, which is acceptable because native isn't part of this UI QA pass
// (design/screens is only being visually verified against the web build); a persistent
// (SQLite/AsyncStorage) native implementation can replace this without changing the SummaryCache
// contract or any caller.
const memoryStore = new Map<string, CachedSummary>();

export function getSummaryCache(): SummaryCache {
  return {
    read(householdId, month) {
      return Promise.resolve(memoryStore.get(summaryCacheKey(householdId, month)));
    },

    write(householdId, month, summary) {
      memoryStore.set(summaryCacheKey(householdId, month), {
        summary,
        cachedAt: new Date().toISOString(),
      });
      return Promise.resolve();
    },
  };
}
