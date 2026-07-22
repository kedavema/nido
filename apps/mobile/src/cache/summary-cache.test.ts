import type { MonthlySummaryResponse } from '@nido/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SummaryCache } from './summary-cache.types';

const SAMPLE_SUMMARY: MonthlySummaryResponse = {
  balance: '10000',
  incomeTotal: '20000',
  expenseTotal: '10000',
  categoryBreakdown: [],
  recentTransactions: [],
};

async function loadCache(): Promise<SummaryCache> {
  const { getSummaryCache } = await import('./summary-cache');
  return getSummaryCache();
}

beforeEach(() => {
  vi.resetModules();
});

describe('native SummaryCache (in-memory stand-in)', () => {
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
});
