import { Prisma } from '../src/generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';

import type { HouseholdAccess } from '../src/households/household.js';
import type { PaymentSourceRecord } from '../src/payment-sources/payment-source.js';
import type { PaymentSourcesRepository } from '../src/payment-sources/payment-sources.repository.js';
import { TrendsReportService } from '../src/transactions/trends-report.service.js';
import type { TransactionsRepository } from '../src/transactions/transactions.repository.js';

const Decimal = Prisma.Decimal;
const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
const personalId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const sharedId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const ownerId = '4ddf0a0a-63de-4aaa-b6b2-4934320baade';
const now = new Date('2026-07-31T12:00:00.000Z');
const access: HouseholdAccess = { householdId, actorId: ownerId, role: 'OWNER', joinedAt: now };

function source(overrides: Partial<PaymentSourceRecord> = {}): PaymentSourceRecord {
  return {
    id: personalId,
    householdId,
    name: 'Tarjeta Kevon',
    type: 'CREDIT_CARD',
    ownerUserId: ownerId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(input: {
  readonly totals?: Readonly<Record<string, { readonly income: string; readonly expense: string }>>;
  readonly sourceTotals?: readonly {
    readonly paymentSourceId: string | null;
    readonly amount: string;
  }[];
  readonly sources?: readonly PaymentSourceRecord[];
}) {
  const getMonthlyTotals = vi.fn((_householdId: string, from: string) => {
    const month = from.slice(0, 7);
    const totals = input.totals?.[month] ?? { income: '0', expense: '0' };
    return Promise.resolve({
      income: new Decimal(totals.income),
      expense: new Decimal(totals.expense),
    });
  });
  const getExpenseTotalsByPaymentSource = vi.fn(() =>
    Promise.resolve(
      (input.sourceTotals ?? []).map((item) => ({
        paymentSourceId: item.paymentSourceId,
        amount: new Decimal(item.amount),
      })),
    ),
  );
  const listForHousehold = vi.fn(() => Promise.resolve(input.sources ?? []));
  const service = new TrendsReportService(
    { getMonthlyTotals, getExpenseTotalsByPaymentSource } satisfies Pick<
      TransactionsRepository,
      'getMonthlyTotals' | 'getExpenseTotalsByPaymentSource'
    >,
    { listForHousehold } satisfies Pick<PaymentSourcesRepository, 'listForHousehold'>,
  );
  return { service, getMonthlyTotals, getExpenseTotalsByPaymentSource, listForHousehold };
}

describe('TrendsReportService', () => {
  it('fills a cross-year three-month window with zeros and scopes every read', async () => {
    const harness = createService({});

    await expect(harness.service.getReport(access, { month: '2026-01' })).resolves.toEqual({
      month: '2026-01',
      points: [
        { month: '2025-11', incomePyg: '0', expensePyg: '0', balancePyg: '0' },
        { month: '2025-12', incomePyg: '0', expensePyg: '0', balancePyg: '0' },
        { month: '2026-01', incomePyg: '0', expensePyg: '0', balancePyg: '0' },
      ],
      totalExpensePyg: '0',
      paymentSources: [],
    });
    expect(harness.getMonthlyTotals.mock.calls).toEqual([
      [householdId, '2025-11-01', '2025-11-30'],
      [householdId, '2025-12-01', '2025-12-31'],
      [householdId, '2026-01-01', '2026-01-31'],
    ]);
    expect(harness.getExpenseTotalsByPaymentSource).toHaveBeenCalledWith(
      householdId,
      '2026-01-01',
      '2026-01-31',
    );
    expect(harness.listForHousehold).toHaveBeenCalledWith(householdId);
  });

  it('computes signed balances and classifies/sorts personal, unassigned, and shared spend', async () => {
    const harness = createService({
      totals: {
        '2026-05': { income: '100', expense: '80' },
        '2026-06': { income: '200', expense: '250' },
        '2026-07': { income: '500', expense: '350' },
      },
      sourceTotals: [
        { paymentSourceId: sharedId, amount: '50' },
        { paymentSourceId: null, amount: '100' },
        { paymentSourceId: personalId, amount: '200' },
      ],
      sources: [
        source({ isActive: false }),
        source({ id: sharedId, name: 'Efectivo compartido', ownerUserId: null }),
      ],
    });

    const report = await harness.service.getReport(access, { month: '2026-07' });

    expect(report.points.map((point) => point.balancePyg)).toEqual(['20', '-50', '150']);
    expect(report.paymentSources).toEqual([
      {
        paymentSourceId: personalId,
        paymentSourceName: 'Tarjeta Kevon',
        ownerUserId: ownerId,
        scope: 'PERSONAL',
        amountPyg: '200',
        percentageOfExpense: 57.14,
      },
      {
        paymentSourceId: null,
        paymentSourceName: 'Sin medio de pago',
        ownerUserId: null,
        scope: 'UNASSIGNED',
        amountPyg: '100',
        percentageOfExpense: 28.57,
      },
      {
        paymentSourceId: sharedId,
        paymentSourceName: 'Efectivo compartido',
        ownerUserId: null,
        scope: 'SHARED',
        amountPyg: '50',
        percentageOfExpense: 14.29,
      },
    ]);
  });

  it('skips a non-null source id that cannot be resolved', async () => {
    const harness = createService({
      totals: { '2026-07': { income: '0', expense: '100' } },
      sourceTotals: [{ paymentSourceId: personalId, amount: '100' }],
      sources: [],
    });

    const report = await harness.service.getReport(access, { month: '2026-07' });
    expect(report.totalExpensePyg).toBe('100');
    expect(report.paymentSources).toEqual([]);
  });
});
