import type { MonthlySummaryResponse } from '@nido/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SummaryCache } from './summary-cache.types';

/**
 * Minimal in-memory stand-in for the web `localStorage` global, which vitest's `node`
 * environment does not provide — mirrors the precedent in sync-store.web.test.ts, which swaps in
 * a fresh fake `indexedDB` per test rather than mocking our own module.
 */
function createFakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

const SAMPLE_SUMMARY: MonthlySummaryResponse = {
  balance: '10000',
  incomeTotal: '20000',
  expenseTotal: '10000',
  categoryBreakdown: [],
  recentTransactions: [],
};

async function loadCache(): Promise<SummaryCache> {
  const { getSummaryCache } = await import('./summary-cache.web');
  return getSummaryCache();
}

beforeEach(() => {
  globalThis.localStorage = createFakeLocalStorage();
});

describe('web SummaryCache (localStorage)', () => {
  it('returns undefined when nothing has been cached for that household+month', async () => {
    const cache = await loadCache();

    await expect(cache.read('household-1', '2026-07')).resolves.toBeUndefined();
  });

  it('round-trips a written summary with a cachedAt timestamp', async () => {
    const cache = await loadCache();

    await cache.write('household-1', '2026-07', SAMPLE_SUMMARY);
    const entry = await cache.read('household-1', '2026-07');

    expect(entry?.summary).toEqual(SAMPLE_SUMMARY);
    expect(entry?.cachedAt).toEqual(expect.any(String));
  });

  it('scopes entries by household id and month independently', async () => {
    const cache = await loadCache();

    await cache.write('household-1', '2026-07', SAMPLE_SUMMARY);

    await expect(cache.read('household-2', '2026-07')).resolves.toBeUndefined();
    await expect(cache.read('household-1', '2026-08')).resolves.toBeUndefined();
  });

  it('treats a malformed stored value as no cache instead of throwing', async () => {
    const cache = await loadCache();
    localStorage.setItem('summary:household-1:2026-07', 'not json');

    await expect(cache.read('household-1', '2026-07')).resolves.toBeUndefined();
  });
});
