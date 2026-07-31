import { Prisma } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { describe, expect, it, vi } from 'vitest';

import { BudgetSummaryService } from '../src/budgets/budget-summary.service.js';

const Decimal = Prisma.Decimal;
const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';

function createPrisma(
  overrides: {
    readonly budgetMonth?: { readonly findUnique: ReturnType<typeof vi.fn> };
    readonly queryRaw?: ReturnType<typeof vi.fn>;
  } = {},
): PrismaService {
  return {
    budgetMonth: {
      findUnique: overrides.budgetMonth?.findUnique ?? vi.fn(() => Promise.resolve(null)),
    },
    $queryRaw: overrides.queryRaw ?? vi.fn(),
  } as unknown as PrismaService;
}

describe('BudgetSummaryService', () => {
  it('returns null without running aggregation queries when the month has no budget', async () => {
    const queryRaw = vi.fn();
    const service = new BudgetSummaryService(createPrisma({ queryRaw }));

    await expect(service.getBudgetSummary(householdId, '2026-07')).resolves.toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('computes actual spend, pending commitments, and percentages with Decimal arithmetic', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ total: '350000' }])
      .mockResolvedValueOnce([{ total: '200000' }]);
    const service = new BudgetSummaryService(
      createPrisma({
        budgetMonth: {
          findUnique: vi.fn(() =>
            Promise.resolve({
              totalLimitPyg: new Decimal('1000000'),
              allocations: [
                { amountPyg: new Decimal('300000') },
                { amountPyg: new Decimal('100000') },
              ],
            }),
          ),
        },
        queryRaw,
      }),
    );

    await expect(service.getBudgetSummary(householdId, '2026-07')).resolves.toEqual({
      totalLimitPyg: '1000000',
      allocatedPyg: '400000',
      unallocatedPyg: '600000',
      spentPyg: '350000',
      availablePyg: '650000',
      pendingCommitmentsPyg: '200000',
      projectedAvailablePyg: '450000',
      spentPercentage: 35,
      projectedPercentage: 55,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('keeps negative availability and projected percentages above 100%', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ total: '1200000' }])
      .mockResolvedValueOnce([{ total: '100000' }]);
    const service = new BudgetSummaryService(
      createPrisma({
        budgetMonth: {
          findUnique: vi.fn(() =>
            Promise.resolve({ totalLimitPyg: new Decimal('1000000'), allocations: [] }),
          ),
        },
        queryRaw,
      }),
    );

    const summary = await service.getBudgetSummary(householdId, '2026-07');

    expect(summary?.availablePyg).toBe('-200000');
    expect(summary?.projectedAvailablePyg).toBe('-300000');
    expect(summary?.spentPercentage).toBe(120);
    expect(summary?.projectedPercentage).toBe(130);
  });

  it('reports zero percentages for a zero-limit budget', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ total: '0' }])
      .mockResolvedValueOnce([{ total: '0' }]);
    const service = new BudgetSummaryService(
      createPrisma({
        budgetMonth: {
          findUnique: vi.fn(() =>
            Promise.resolve({ totalLimitPyg: new Decimal('0'), allocations: [] }),
          ),
        },
        queryRaw,
      }),
    );

    await expect(service.getBudgetSummary(householdId, '2026-07')).resolves.toMatchObject({
      spentPercentage: 0,
      projectedPercentage: 0,
    });
  });
});
