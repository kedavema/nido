import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { CategoryRecord } from '../src/categories/category.js';
import type { CategoriesRepository } from '../src/categories/categories.repository.js';
import type { Clock } from '../src/common/clock.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { HouseholdAccess } from '../src/households/household.js';
import type { HouseholdsRepository } from '../src/households/households.repository.js';
import type { PaymentSourceRecord } from '../src/payment-sources/payment-source.js';
import type { PaymentSourcesRepository } from '../src/payment-sources/payment-sources.repository.js';
import type {
  CreateRecurringItemRecordInput,
  GeneratedOccurrenceInput,
  RecurringItemRecord,
  UpdateRecurringItemRecordChanges,
} from '../src/recurring-items/recurring-item.js';
import type { RecurringItemsRepository } from '../src/recurring-items/recurring-items.repository.js';
import { RecurringItemsService } from '../src/recurring-items/recurring-items.service.js';

const Decimal = Prisma.Decimal;

const now = new Date('2026-07-19T12:00:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};
const recurringItemId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const categoryId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const paymentSourceId = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const responsibleUserId = '1a2b3c4d-5e6f-4708-9a0b-1c2d3e4f5061';

function recurringItemRecord(overrides: Partial<RecurringItemRecord> = {}): RecurringItemRecord {
  return {
    id: recurringItemId,
    householdId: access.householdId,
    kind: 'EXPENSE',
    name: 'Internet',
    description: null,
    categoryId,
    paymentSourceId: null,
    responsibleUserId: null,
    estimatedAmount: new Decimal('200000'),
    currency: 'PYG',
    plannedFxRateToBase: null,
    frequency: 'MONTHLY',
    intervalMonths: null,
    firstDueDate: new Date('2026-07-10T00:00:00.000Z'),
    endDate: null,
    notificationOffsets: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function categoryRecord(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: categoryId,
    householdId: access.householdId,
    kind: 'EXPENSE',
    parentId: null,
    name: 'Servicios',
    icon: 'wifi',
    color: '#AABBCC',
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function paymentSourceRecord(overrides: Partial<PaymentSourceRecord> = {}): PaymentSourceRecord {
  return {
    id: paymentSourceId,
    householdId: access.householdId,
    name: 'Efectivo',
    type: 'CASH',
    ownerUserId: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRecurringItemsRepository(
  overrides: Partial<RecurringItemsRepository> = {},
): RecurringItemsRepository {
  return {
    list: () => Promise.resolve([]),
    findInHousehold: () => Promise.resolve(null),
    createWithOccurrences: () => Promise.reject(new Error('not used')),
    updateWithFutureOccurrences: () => Promise.reject(new Error('not used')),
    deactivate: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

function createCategoriesRepository(
  overrides: Partial<Pick<CategoriesRepository, 'findInHousehold'>> = {},
): CategoriesRepository {
  return {
    listForHousehold: () => Promise.reject(new Error('not used')),
    findInHousehold: () => Promise.resolve(categoryRecord()),
    findActiveSibling: () => Promise.reject(new Error('not used')),
    hasChildren: () => Promise.reject(new Error('not used')),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.reject(new Error('not used')),
    archive: () => Promise.reject(new Error('not used')),
    deleteById: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

function createPaymentSourcesRepository(
  overrides: Partial<Pick<PaymentSourcesRepository, 'findInHousehold'>> = {},
): PaymentSourcesRepository {
  return {
    listForHousehold: () => Promise.reject(new Error('not used')),
    findInHousehold: () => Promise.resolve(paymentSourceRecord()),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.reject(new Error('not used')),
    archive: () => Promise.reject(new Error('not used')),
    deleteById: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

function createHouseholdsRepository(
  overrides: Partial<Pick<HouseholdsRepository, 'findActiveAccess'>> = {},
): HouseholdsRepository {
  return {
    listActiveForUser: () => Promise.reject(new Error('not used')),
    createWithOwner: () => Promise.reject(new Error('not used')),
    findActiveAccess: () => Promise.resolve(access),
    findDetail: () => Promise.reject(new Error('not used')),
    listMembers: () => Promise.reject(new Error('not used')),
    createInvite: () => Promise.reject(new Error('not used')),
    acceptInvite: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

function createClock(fixedNow: Date = now): Clock {
  return { now: () => fixedNow };
}

function createService(
  overrides: {
    readonly recurringItemsRepository?: Partial<RecurringItemsRepository>;
    readonly categoriesRepository?: Partial<Pick<CategoriesRepository, 'findInHousehold'>>;
    readonly paymentSourcesRepository?: Partial<Pick<PaymentSourcesRepository, 'findInHousehold'>>;
    readonly householdsRepository?: Partial<Pick<HouseholdsRepository, 'findActiveAccess'>>;
    readonly clock?: Clock;
  } = {},
): RecurringItemsService {
  return new RecurringItemsService(
    createRecurringItemsRepository(overrides.recurringItemsRepository),
    createCategoriesRepository(overrides.categoriesRepository),
    createPaymentSourcesRepository(overrides.paymentSourcesRepository),
    createHouseholdsRepository(overrides.householdsRepository),
    overrides.clock ?? createClock(),
  );
}

const validCreateInput = {
  kind: 'EXPENSE' as const,
  name: 'Internet',
  categoryId,
  estimatedAmount: '200000',
  currency: 'PYG' as const,
  frequency: 'MONTHLY' as const,
  firstDueDate: '2026-07-10',
};

describe('RecurringItemsService list/get', () => {
  it('lists recurring items for the household', async () => {
    const list = vi.fn(() => Promise.resolve([recurringItemRecord()]));
    const service = createService({ recurringItemsRepository: { list } });

    const response = await service.listRecurringItems(access);

    expect(list).toHaveBeenCalledWith(access.householdId);
    expect(response.recurringItems).toHaveLength(1);
  });

  it('rejects a recurring item outside the household as not found', async () => {
    const service = createService({
      recurringItemsRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(service.getRecurringItem(access, recurringItemId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('RecurringItemsService create', () => {
  it('generates the full occurrence schedule and creates the rule atomically', async () => {
    const createWithOccurrences = vi.fn<
      (
        input: CreateRecurringItemRecordInput,
        occurrences: readonly GeneratedOccurrenceInput[],
      ) => Promise<RecurringItemRecord>
    >(() => Promise.resolve(recurringItemRecord()));
    const service = createService({
      recurringItemsRepository: { createWithOccurrences },
    });

    const response = await service.createRecurringItem(access, validCreateInput);

    expect(response.recurringItem.id).toBe(recurringItemId);
    const [input, occurrences] = createWithOccurrences.mock.calls[0] ?? [];
    expect(input?.householdId).toBe(access.householdId);
    expect(input?.categoryId).toBe(categoryId);
    expect(input?.notificationOffsets).toEqual([]);
    // MONTHLY from 2026-07-10 through the 12-month horizon inclusive: 13 occurrences.
    expect(occurrences).toHaveLength(13);
    expect(occurrences?.[0]?.dueDate.toISOString()).toBe('2026-07-10T00:00:00.000Z');
    expect(occurrences?.every((occurrence) => occurrence.amount.toFixed(0) === '200000')).toBe(
      true,
    );
  });

  it('rejects a category outside the household', async () => {
    const service = createService({
      categoriesRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(service.createRecurringItem(access, validCreateInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a category whose kind does not match the recurring item kind', async () => {
    const service = createService({
      categoriesRepository: {
        findInHousehold: () => Promise.resolve(categoryRecord({ kind: 'INCOME' })),
      },
    });

    await expect(service.createRecurringItem(access, validCreateInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a payment source outside the household', async () => {
    const service = createService({
      paymentSourcesRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(
      service.createRecurringItem(access, { ...validCreateInput, paymentSourceId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a responsible user who is not an active member of the household', async () => {
    const service = createService({
      householdsRepository: { findActiveAccess: () => Promise.resolve(null) },
    });

    await expect(
      service.createRecurringItem(access, { ...validCreateInput, responsibleUserId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects EVERY_N_MONTHS without intervalMonths', async () => {
    const service = createService();

    await expect(
      service.createRecurringItem(access, {
        ...validCreateInput,
        frequency: 'EVERY_N_MONTHS',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects intervalMonths present for a non-EVERY_N_MONTHS frequency', async () => {
    const service = createService();

    await expect(
      service.createRecurringItem(access, {
        ...validCreateInput,
        frequency: 'MONTHLY',
        intervalMonths: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a USD amount without plannedFxRateToBase before touching the repository', async () => {
    const createWithOccurrences = vi.fn();
    const service = createService({
      recurringItemsRepository: { createWithOccurrences },
    });

    await expect(
      service.createRecurringItem(access, {
        ...validCreateInput,
        currency: 'USD',
        estimatedAmount: '10.00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createWithOccurrences).not.toHaveBeenCalled();
  });
});

describe('RecurringItemsService update', () => {
  it('rejects a recurring item outside the household as not found', async () => {
    const service = createService({
      recurringItemsRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(
      service.updateRecurringItem(access, recurringItemId, { name: 'Nuevo' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('regenerates only occurrences due today-or-later, computed from the effective (possibly updated) rule', async () => {
    const updateWithFutureOccurrences = vi.fn<
      (
        householdId: string,
        id: string,
        changes: UpdateRecurringItemRecordChanges,
        regeneration: {
          readonly today: Date;
          readonly occurrences: readonly GeneratedOccurrenceInput[];
        } | null,
      ) => Promise<RecurringItemRecord | null>
    >(() => Promise.resolve(recurringItemRecord({ estimatedAmount: new Decimal('250000') })));
    const service = createService({
      recurringItemsRepository: {
        findInHousehold: () => Promise.resolve(recurringItemRecord()),
        updateWithFutureOccurrences,
      },
      clock: createClock(new Date('2026-09-15T00:00:00.000Z')),
    });

    await service.updateRecurringItem(access, recurringItemId, { estimatedAmount: '250000' });

    const [householdId, id, changes, regeneration] =
      updateWithFutureOccurrences.mock.calls[0] ?? [];
    expect(householdId).toBe(access.householdId);
    expect(id).toBe(recurringItemId);
    expect(changes?.estimatedAmount?.toFixed(0)).toBe('250000');
    expect(regeneration?.today.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    // Existing rule: MONTHLY from 2026-07-10 through 2027-07-10. "Today" is 2026-09-15, so the
    // 07-10 and 08-10 occurrences are in the past and must be excluded from regeneration.
    expect(regeneration?.occurrences.map((o) => o.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
      '2027-02-10',
      '2027-03-10',
      '2027-04-10',
      '2027-05-10',
      '2027-06-10',
      '2027-07-10',
    ]);
    expect(
      regeneration?.occurrences.every((occurrence) => occurrence.amount.toFixed(0) === '250000'),
    ).toBe(true);
  });

  it('does not regenerate occurrences when the rule is already inactive and stays inactive', async () => {
    const updateWithFutureOccurrences = vi.fn(() => Promise.resolve(recurringItemRecord()));
    const service = createService({
      recurringItemsRepository: {
        findInHousehold: () => Promise.resolve(recurringItemRecord({ isActive: false })),
        updateWithFutureOccurrences,
      },
    });

    await service.updateRecurringItem(access, recurringItemId, { name: 'Nuevo nombre' });

    expect(updateWithFutureOccurrences).toHaveBeenCalledWith(
      access.householdId,
      recurringItemId,
      expect.objectContaining({ name: 'Nuevo nombre' }),
      null,
    );
  });

  it('skips regeneration when the same PATCH deactivates the rule', async () => {
    const updateWithFutureOccurrences = vi.fn(() => Promise.resolve(recurringItemRecord()));
    const service = createService({
      recurringItemsRepository: {
        findInHousehold: () => Promise.resolve(recurringItemRecord({ isActive: true })),
        updateWithFutureOccurrences,
      },
    });

    await service.updateRecurringItem(access, recurringItemId, {
      isActive: false,
      estimatedAmount: '999999',
    });

    expect(updateWithFutureOccurrences).toHaveBeenCalledWith(
      access.householdId,
      recurringItemId,
      expect.objectContaining({ isActive: false, estimatedAmount: expect.anything() }),
      null,
    );
  });

  it('regenerates when reactivating a previously inactive rule', async () => {
    const updateWithFutureOccurrences = vi.fn<
      (
        householdId: string,
        id: string,
        changes: UpdateRecurringItemRecordChanges,
        regeneration: {
          readonly today: Date;
          readonly occurrences: readonly GeneratedOccurrenceInput[];
        } | null,
      ) => Promise<RecurringItemRecord | null>
    >(() => Promise.resolve(recurringItemRecord()));
    const service = createService({
      recurringItemsRepository: {
        findInHousehold: () => Promise.resolve(recurringItemRecord({ isActive: false })),
        updateWithFutureOccurrences,
      },
      clock: createClock(new Date('2026-07-10T00:00:00.000Z')),
    });

    await service.updateRecurringItem(access, recurringItemId, { isActive: true });

    const [, , , regeneration] = updateWithFutureOccurrences.mock.calls[0] ?? [];
    expect(regeneration).not.toBeNull();
    expect(regeneration?.occurrences.length).toBeGreaterThan(0);
  });

  it('re-checks frequency/intervalMonths consistency using the merged effective state', async () => {
    const service = createService({
      recurringItemsRepository: {
        findInHousehold: () =>
          Promise.resolve(recurringItemRecord({ frequency: 'EVERY_N_MONTHS', intervalMonths: 2 })),
      },
    });

    // Removing intervalMonths (explicit null) while frequency stays EVERY_N_MONTHS (not sent) is
    // invalid — the update payload alone cannot see this, only the merged effective state can.
    await expect(
      service.updateRecurringItem(access, recurringItemId, { intervalMonths: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a concurrent removal during update to not found', async () => {
    const service = createService({
      recurringItemsRepository: {
        findInHousehold: () => Promise.resolve(recurringItemRecord()),
        updateWithFutureOccurrences: () => Promise.resolve(null),
      },
    });

    await expect(
      service.updateRecurringItem(access, recurringItemId, { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RecurringItemsService delete', () => {
  it('rejects a recurring item outside the household as not found', async () => {
    const service = createService({
      recurringItemsRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(service.deleteRecurringItem(access, recurringItemId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deactivates rather than hard-deletes', async () => {
    const deactivate = vi.fn(() => Promise.resolve(recurringItemRecord({ isActive: false })));
    const service = createService({
      recurringItemsRepository: {
        findInHousehold: () => Promise.resolve(recurringItemRecord()),
        deactivate,
      },
    });

    await service.deleteRecurringItem(access, recurringItemId);

    expect(deactivate).toHaveBeenCalledWith(access.householdId, recurringItemId);
  });
});
