import { describe, expect, it } from 'vitest';

import type { Clock } from '../src/common/clock.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { HouseholdAccess } from '../src/households/household.js';
import type { OccurrenceListFilters, OccurrenceRecord } from '../src/occurrences/occurrence.js';
import type {
  OccurrenceSettlementRepository,
  SettleOccurrenceResult,
  SkipOccurrenceResult,
} from '../src/occurrences/occurrence-settlement.repository.js';
import type { OccurrenceSweepRepository } from '../src/occurrences/occurrence-sweep.repository.js';
import type { OccurrencesRepository } from '../src/occurrences/occurrences.repository.js';
import { OccurrencesService } from '../src/occurrences/occurrences.service.js';

const Decimal = Prisma.Decimal;

const now = new Date('2026-07-23T09:30:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};

function occurrenceRecord(overrides: Partial<OccurrenceRecord> = {}): OccurrenceRecord {
  return {
    id: '0d539fa4-e991-41d7-9d31-258b1307ec31',
    recurringItemId: 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061',
    householdId: access.householdId,
    dueDate: new Date('2026-07-10T00:00:00.000Z'),
    amount: new Decimal('200000'),
    currency: 'PYG',
    fxRateToBase: null,
    responsibleUserId: null,
    status: 'PENDING',
    settledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeOccurrencesRepository implements OccurrencesRepository {
  public lastFilters: OccurrenceListFilters | undefined;
  constructor(private readonly records: readonly OccurrenceRecord[]) {}

  list(householdId: string, filters: OccurrenceListFilters): Promise<readonly OccurrenceRecord[]> {
    this.lastFilters = filters;
    return Promise.resolve(this.records);
  }
}

class FakeSweepRepository implements OccurrenceSweepRepository {
  public calls: { readonly householdId: string; readonly today: Date }[] = [];
  public listedBeforeSweep = false;
  constructor(private readonly repository: FakeOccurrencesRepository) {}

  sweep(householdId: string, today: Date): Promise<void> {
    // Records whether the list already ran when the sweep is invoked, so the test can assert the
    // sweep is triggered strictly before the read (lazy-on-read must refresh first, then list).
    this.listedBeforeSweep = this.repository.lastFilters !== undefined;
    this.calls.push({ householdId, today });
    return Promise.resolve();
  }
}

class FakeSettlementRepository implements OccurrenceSettlementRepository {
  settle(): Promise<SettleOccurrenceResult> {
    return Promise.resolve({ kind: 'not_found' });
  }
  skip(): Promise<SkipOccurrenceResult> {
    return Promise.resolve({ kind: 'not_found' });
  }
}

const clock: Clock = { now: () => now };
const settlement = new FakeSettlementRepository();

describe('OccurrencesService', () => {
  it('triggers the sweep for the household before listing, at the current UTC calendar day', async () => {
    const repository = new FakeOccurrencesRepository([]);
    const sweep = new FakeSweepRepository(repository);
    const service = new OccurrencesService(repository, sweep, settlement, clock);

    await service.listOccurrences(access, {});

    expect(sweep.calls).toHaveLength(1);
    expect(sweep.calls[0]?.householdId).toBe(access.householdId);
    expect(sweep.calls[0]?.today.toISOString()).toBe('2026-07-23T00:00:00.000Z');
    expect(sweep.listedBeforeSweep).toBe(false);
  });

  it('passes status and parsed date-range filters through to the repository', async () => {
    const repository = new FakeOccurrencesRepository([]);
    const sweep = new FakeSweepRepository(repository);
    const service = new OccurrencesService(repository, sweep, settlement, clock);

    await service.listOccurrences(access, {
      status: ['PENDING', 'OVERDUE'],
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(repository.lastFilters?.statuses).toEqual(['PENDING', 'OVERDUE']);
    expect(repository.lastFilters?.from?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(repository.lastFilters?.to?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('omits filters entirely when the query carries none', async () => {
    const repository = new FakeOccurrencesRepository([]);
    const sweep = new FakeSweepRepository(repository);
    const service = new OccurrencesService(repository, sweep, settlement, clock);

    await service.listOccurrences(access, {});

    expect(repository.lastFilters).toEqual({});
  });

  it('serializes amounts by currency and normalizes nullable and date fields', async () => {
    const repository = new FakeOccurrencesRepository([
      occurrenceRecord({ currency: 'PYG', amount: new Decimal('200000') }),
      occurrenceRecord({
        id: 'b2c3d4e5-f6a7-4809-ab0c-1d2e3f405162',
        currency: 'USD',
        amount: new Decimal('12.5'),
        fxRateToBase: new Decimal('7300'),
        status: 'SETTLED',
        settledAt: new Date('2026-07-09T15:00:00.000Z'),
      }),
    ]);
    const sweep = new FakeSweepRepository(repository);
    const service = new OccurrencesService(repository, sweep, settlement, clock);

    const response = await service.listOccurrences(access, {});

    expect(response.occurrences[0]?.amount).toBe('200000');
    expect(response.occurrences[0]?.fxRateToBase).toBeNull();
    expect(response.occurrences[0]?.settledAt).toBeNull();
    expect(response.occurrences[0]?.dueDate).toBe('2026-07-10');
    expect(response.occurrences[1]?.amount).toBe('12.50');
    expect(response.occurrences[1]?.fxRateToBase).toBe('7300');
    expect(response.occurrences[1]?.settledAt).toBe('2026-07-09T15:00:00.000Z');
  });
});
