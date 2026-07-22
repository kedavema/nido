import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { CategoryRecord } from '../src/categories/category.js';
import type { CategoriesRepository } from '../src/categories/categories.repository.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { HouseholdAccess, HouseholdDetailRecord } from '../src/households/household.js';
import type { HouseholdsRepository } from '../src/households/households.repository.js';
import type { PaymentSourceRecord } from '../src/payment-sources/payment-source.js';
import type { PaymentSourcesRepository } from '../src/payment-sources/payment-sources.repository.js';
import type {
  CreateTransactionRecordInput,
  TransactionRecord,
  UpdateTransactionRecordChanges,
} from '../src/transactions/transaction.js';
import {
  TransactionCategoryInvalidError,
  TransactionIdempotencyKeyCollisionError,
  TransactionPaymentSourceInvalidError,
  type TransactionsRepository,
} from '../src/transactions/transactions.repository.js';
import {
  computeClientMutationHash,
  TransactionsService,
} from '../src/transactions/transactions.service.js';

const Decimal = Prisma.Decimal;

const now = new Date('2026-07-19T12:00:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};
const transactionId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const categoryId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const paymentSourceId = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const clientMutationId = '1a2b3c4d-5e6f-4708-9a0b-1c2d3e4f5061';

function transactionRecord(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: transactionId,
    householdId: access.householdId,
    type: 'EXPENSE',
    amount: new Decimal('150000'),
    currency: 'PYG',
    fxRateToBase: null,
    baseAmountPyg: new Decimal('150000'),
    occurredAt: now,
    localDate: new Date('2026-07-19T00:00:00.000Z'),
    categoryId,
    paymentSourceId: null,
    description: 'Supermercado',
    notes: null,
    origin: 'MANUAL',
    createdBy: access.actorId,
    updatedBy: access.actorId,
    createdAt: now,
    updatedAt: now,
    clientMutationId: null,
    clientMutationHash: null,
    ...overrides,
  };
}

function categoryRecord(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: categoryId,
    householdId: access.householdId,
    kind: 'EXPENSE',
    parentId: null,
    name: 'Alimentacion',
    icon: 'cart',
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

function householdDetailRecord(
  overrides: Partial<HouseholdDetailRecord> = {},
): HouseholdDetailRecord {
  return {
    id: access.householdId,
    name: 'Casa',
    baseCurrency: 'PYG',
    timezone: 'America/Asuncion',
    role: access.role,
    joinedAt: now,
    createdByUserId: access.actorId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTransactionsRepository(
  overrides: Partial<TransactionsRepository> = {},
): TransactionsRepository {
  return {
    list: () => Promise.resolve([]),
    findInHousehold: () => Promise.resolve(null),
    findByClientMutationId: () => Promise.reject(new Error('not used')),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.reject(new Error('not used')),
    deleteById: () => Promise.reject(new Error('not used')),
    getMonthlyTotals: () => Promise.reject(new Error('not used')),
    getExpenseTotalsByCategory: () => Promise.reject(new Error('not used')),
    findRecent: () => Promise.reject(new Error('not used')),
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
  overrides: Partial<Pick<HouseholdsRepository, 'findDetail'>> = {},
): HouseholdsRepository {
  return {
    listActiveForUser: () => Promise.reject(new Error('not used')),
    createWithOwner: () => Promise.reject(new Error('not used')),
    findActiveAccess: () => Promise.reject(new Error('not used')),
    findDetail: () => Promise.resolve(householdDetailRecord()),
    listMembers: () => Promise.reject(new Error('not used')),
    createInvite: () => Promise.reject(new Error('not used')),
    acceptInvite: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

function createService(
  overrides: {
    readonly transactionsRepository?: Partial<TransactionsRepository>;
    readonly categoriesRepository?: Partial<Pick<CategoriesRepository, 'findInHousehold'>>;
    readonly paymentSourcesRepository?: Partial<Pick<PaymentSourcesRepository, 'findInHousehold'>>;
    readonly householdsRepository?: Partial<Pick<HouseholdsRepository, 'findDetail'>>;
  } = {},
): TransactionsService {
  return new TransactionsService(
    createTransactionsRepository(overrides.transactionsRepository),
    createCategoriesRepository(overrides.categoriesRepository),
    createPaymentSourcesRepository(overrides.paymentSourcesRepository),
    createHouseholdsRepository(overrides.householdsRepository),
  );
}

describe('TransactionsService list', () => {
  it('lists transactions with the query mapped straight through as filters', async () => {
    const list = vi.fn(() => Promise.resolve([transactionRecord()]));
    const service = createService({ transactionsRepository: { list } });

    const response = await service.listTransactions(access, {
      from: '2026-07-01',
      to: '2026-07-31',
      type: 'EXPENSE',
      search: 'super',
    });

    expect(response.transactions).toHaveLength(1);
    expect(list).toHaveBeenCalledWith(access.householdId, {
      from: '2026-07-01',
      to: '2026-07-31',
      type: 'EXPENSE',
      categoryId: undefined,
      paymentSourceId: undefined,
      createdBy: undefined,
      currency: undefined,
      search: 'super',
    });
  });
});

describe('TransactionsService get', () => {
  it('rejects a transaction outside the household as not found', async () => {
    const service = createService({
      transactionsRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(service.getTransaction(access, transactionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the transaction shaped as the contract expects', async () => {
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()),
      },
    });

    const response = await service.getTransaction(access, transactionId);

    expect(response.transaction).toEqual({
      id: transactionId,
      householdId: access.householdId,
      type: 'EXPENSE',
      amount: '150000',
      currency: 'PYG',
      fxRateToBase: null,
      baseAmountPyg: '150000',
      occurredAt: now.toISOString(),
      localDate: '2026-07-19',
      categoryId,
      paymentSourceId: null,
      description: 'Supermercado',
      notes: null,
      origin: 'MANUAL',
      createdBy: access.actorId,
      updatedBy: access.actorId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it('formats a USD amount to exactly two decimals regardless of the stored scale', async () => {
    const service = createService({
      transactionsRepository: {
        findInHousehold: () =>
          Promise.resolve(
            transactionRecord({
              currency: 'USD',
              amount: new Decimal('10'),
              fxRateToBase: new Decimal('7350'),
              baseAmountPyg: new Decimal('73500'),
            }),
          ),
      },
    });

    const response = await service.getTransaction(access, transactionId);

    expect(response.transaction.amount).toBe('10.00');
    expect(response.transaction.fxRateToBase).toBe('7350');
  });
});

describe('TransactionsService create', () => {
  it('creates a PYG expense transaction', async () => {
    const create = vi.fn<(input: CreateTransactionRecordInput) => Promise<TransactionRecord>>(() =>
      Promise.resolve(transactionRecord()),
    );
    const service = createService({ transactionsRepository: { create } });

    const response = await service.createTransaction(access, {
      type: 'EXPENSE',
      amount: '150000',
      currency: 'PYG',
      occurredAt: '2026-07-19T12:00:00.000Z',
      categoryId,
      description: 'Supermercado',
    });

    expect(response.transaction.id).toBe(transactionId);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: access.householdId,
        type: 'EXPENSE',
        currency: 'PYG',
        categoryId,
        paymentSourceId: null,
        createdBy: access.actorId,
        updatedBy: access.actorId,
        description: 'Supermercado',
        notes: null,
      }),
    );
    const createInput = create.mock.calls[0]?.[0];
    expect(createInput?.amount.toFixed(0)).toBe('150000');
    expect(createInput?.baseAmountPyg.toFixed(0)).toBe('150000');
    expect(createInput?.fxRateToBase).toBeNull();
    expect(createInput?.localDate.toISOString()).toBe('2026-07-19T00:00:00.000Z');
  });

  it("converts a USD amount to baseAmountPyg using ADR 0001's half-up rounding", async () => {
    const create = vi.fn<(input: CreateTransactionRecordInput) => Promise<TransactionRecord>>(() =>
      Promise.resolve(transactionRecord({ currency: 'USD' })),
    );
    const service = createService({ transactionsRepository: { create } });

    await service.createTransaction(access, {
      type: 'EXPENSE',
      amount: '10.01',
      currency: 'USD',
      fxRateToBase: '7350',
      occurredAt: '2026-07-19T12:00:00.000Z',
      categoryId,
      description: 'Compra en USD',
    });

    const createInput = create.mock.calls[0]?.[0];
    expect(createInput?.baseAmountPyg.toFixed(0)).toBe('73574');
  });

  it('derives localDate from occurredAt and the household timezone', async () => {
    const create = vi.fn<(input: CreateTransactionRecordInput) => Promise<TransactionRecord>>(() =>
      Promise.resolve(transactionRecord()),
    );
    const findDetail = vi.fn(() => Promise.resolve(householdDetailRecord()));
    const service = createService({
      transactionsRepository: { create },
      householdsRepository: { findDetail },
    });

    // 02:00 UTC - America/Asuncion (UTC-3) -> 23:00 the previous local day.
    await service.createTransaction(access, {
      type: 'EXPENSE',
      amount: '10000',
      currency: 'PYG',
      occurredAt: '2026-07-20T02:00:00.000Z',
      categoryId,
      description: 'Gasto nocturno',
    });

    expect(findDetail).toHaveBeenCalledWith(access);
    const createInput = create.mock.calls[0]?.[0];
    expect(createInput?.localDate.toISOString()).toBe('2026-07-19T00:00:00.000Z');
  });

  it('rejects a category outside the household', async () => {
    const service = createService({
      categoriesRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(
      service.createTransaction(access, {
        type: 'EXPENSE',
        amount: '150000',
        currency: 'PYG',
        occurredAt: '2026-07-19T12:00:00.000Z',
        categoryId,
        description: 'Supermercado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a category whose kind does not match the transaction type', async () => {
    const service = createService({
      categoriesRepository: {
        findInHousehold: () => Promise.resolve(categoryRecord({ kind: 'INCOME' })),
      },
    });

    await expect(
      service.createTransaction(access, {
        type: 'EXPENSE',
        amount: '150000',
        currency: 'PYG',
        occurredAt: '2026-07-19T12:00:00.000Z',
        categoryId,
        description: 'Supermercado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a payment source outside the household', async () => {
    const service = createService({
      paymentSourcesRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(
      service.createTransaction(access, {
        type: 'EXPENSE',
        amount: '150000',
        currency: 'PYG',
        occurredAt: '2026-07-19T12:00:00.000Z',
        categoryId,
        paymentSourceId,
        description: 'Supermercado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a USD amount without fxRateToBase before touching the repository', async () => {
    const create = vi.fn(() => Promise.resolve(transactionRecord()));
    const service = createService({ transactionsRepository: { create } });

    await expect(
      service.createTransaction(access, {
        type: 'EXPENSE',
        amount: '10.01',
        currency: 'USD',
        occurredAt: '2026-07-19T12:00:00.000Z',
        categoryId,
        description: 'Compra en USD',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a persistence category race to a bad request', async () => {
    const service = createService({
      transactionsRepository: {
        create: () => Promise.reject(new TransactionCategoryInvalidError()),
      },
    });

    await expect(
      service.createTransaction(access, {
        type: 'EXPENSE',
        amount: '150000',
        currency: 'PYG',
        occurredAt: '2026-07-19T12:00:00.000Z',
        categoryId,
        description: 'Supermercado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a persistence payment-source race to a bad request', async () => {
    const service = createService({
      transactionsRepository: {
        create: () => Promise.reject(new TransactionPaymentSourceInvalidError()),
      },
    });

    await expect(
      service.createTransaction(access, {
        type: 'EXPENSE',
        amount: '150000',
        currency: 'PYG',
        occurredAt: '2026-07-19T12:00:00.000Z',
        categoryId,
        paymentSourceId,
        description: 'Supermercado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ADR 0003 idempotency protocol — service-level unit coverage (mocked repository). Integration
// coverage against real PostgreSQL (the composite unique index, concurrency, replay) lives in
// transactions-api.integration.spec.ts.
describe('TransactionsService create idempotency (ADR 0003)', () => {
  const baseInput = {
    type: 'EXPENSE' as const,
    amount: '150000',
    currency: 'PYG' as const,
    occurredAt: '2026-07-19T12:00:00.000Z',
    categoryId,
    description: 'Supermercado',
  };

  it('leaves the plain create path untouched when clientMutationId is absent (back-compat)', async () => {
    const create = vi.fn<(input: CreateTransactionRecordInput) => Promise<TransactionRecord>>(() =>
      Promise.resolve(transactionRecord()),
    );
    const findByClientMutationId = vi.fn();
    const service = createService({
      transactionsRepository: { create, findByClientMutationId },
    });

    await service.createTransaction(access, baseInput);

    const createInput = create.mock.calls[0]?.[0];
    expect(createInput?.clientMutationId).toBeNull();
    expect(createInput?.clientMutationHash).toBeNull();
    expect(findByClientMutationId).not.toHaveBeenCalled();
  });

  it('computes and sends a hash when clientMutationId is present', async () => {
    const create = vi.fn<(input: CreateTransactionRecordInput) => Promise<TransactionRecord>>(() =>
      Promise.resolve(transactionRecord({ clientMutationId, clientMutationHash: 'irrelevant' })),
    );
    const service = createService({ transactionsRepository: { create } });

    await service.createTransaction(access, { ...baseInput, clientMutationId });

    const createInput = create.mock.calls[0]?.[0];
    expect(createInput?.clientMutationId).toBe(clientMutationId);
    expect(createInput?.clientMutationHash).toBe(computeClientMutationHash({
      ...baseInput,
      clientMutationId,
    }));
  });

  it('returns the existing transaction as a replay when the collision hash matches', async () => {
    const expectedHash = computeClientMutationHash({ ...baseInput, clientMutationId });
    const create = vi.fn(() => Promise.reject(new TransactionIdempotencyKeyCollisionError()));
    const findByClientMutationId = vi.fn(() =>
      Promise.resolve(
        transactionRecord({ clientMutationId, clientMutationHash: expectedHash }),
      ),
    );
    const service = createService({
      transactionsRepository: { create, findByClientMutationId },
    });

    const response = await service.createTransaction(access, {
      ...baseInput,
      clientMutationId,
    });

    expect(response.transaction.id).toBe(transactionId);
    expect(findByClientMutationId).toHaveBeenCalledWith(
      access.actorId,
      access.householdId,
      clientMutationId,
    );
  });

  it('rejects with 409 when the same key collides with a different stored hash', async () => {
    const create = vi.fn(() => Promise.reject(new TransactionIdempotencyKeyCollisionError()));
    const findByClientMutationId = vi.fn(() =>
      Promise.resolve(
        transactionRecord({ clientMutationId, clientMutationHash: 'a-different-hash' }),
      ),
    );
    const service = createService({
      transactionsRepository: { create, findByClientMutationId },
    });

    await expect(
      service.createTransaction(access, { ...baseInput, clientMutationId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects with 409 when the colliding row cannot be re-fetched', async () => {
    const create = vi.fn(() => Promise.reject(new TransactionIdempotencyKeyCollisionError()));
    const findByClientMutationId = vi.fn(() => Promise.resolve(null));
    const service = createService({
      transactionsRepository: { create, findByClientMutationId },
    });

    await expect(
      service.createTransaction(access, { ...baseInput, clientMutationId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('computeClientMutationHash', () => {
  const input = {
    type: 'EXPENSE' as const,
    amount: '150000',
    currency: 'PYG' as const,
    occurredAt: '2026-07-19T12:00:00.000Z',
    categoryId,
    description: 'Supermercado',
  };

  it('is deterministic for identical semantic input', () => {
    expect(computeClientMutationHash(input)).toBe(computeClientMutationHash({ ...input }));
  });

  it('changes when a business field changes', () => {
    expect(computeClientMutationHash(input)).not.toBe(
      computeClientMutationHash({ ...input, amount: '150001' }),
    );
  });

  it('does not change based on clientMutationId itself (a transport/idempotency field, not business data)', () => {
    expect(computeClientMutationHash(input)).toBe(
      computeClientMutationHash({ ...input, clientMutationId }),
    );
  });
});

describe('TransactionsService update', () => {
  it('rejects a transaction outside the household as not found', async () => {
    const service = createService({
      transactionsRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(
      service.updateTransaction(access, transactionId, { description: 'Nuevo' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates the description without touching money or category fields', async () => {
    const update = vi.fn<
      (
        householdId: string,
        transactionId: string,
        changes: UpdateTransactionRecordChanges,
      ) => Promise<TransactionRecord | null>
    >(() => Promise.resolve(transactionRecord({ description: 'Nuevo' })));
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()),
        update,
      },
    });

    const response = await service.updateTransaction(access, transactionId, {
      description: 'Nuevo',
    });

    expect(response.transaction.description).toBe('Nuevo');
    const changes = update.mock.calls[0]?.[2];
    expect(changes?.description).toBe('Nuevo');
    expect(changes?.amount).toBeUndefined();
    expect(changes?.type).toBeUndefined();
    expect(changes?.baseAmountPyg.toFixed(0)).toBe('150000');
    expect(changes?.updatedBy).toBe(access.actorId);
  });

  it('re-checks the category when only the type changes', async () => {
    // The existing category stays EXPENSE-kind; switching the transaction to INCOME without
    // also moving it to an INCOME category must be rejected.
    const findInHouseholdCategory = vi.fn(() =>
      Promise.resolve(categoryRecord({ kind: 'EXPENSE' })),
    );
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()),
        update: () => Promise.resolve(transactionRecord()),
      },
      categoriesRepository: { findInHousehold: findInHouseholdCategory },
    });

    await expect(
      service.updateTransaction(access, transactionId, { type: 'INCOME' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findInHouseholdCategory).toHaveBeenCalledWith(access.householdId, categoryId);
  });

  it('skips the category check when neither type nor categoryId changed', async () => {
    const findInHouseholdCategory = vi.fn(() => Promise.resolve(categoryRecord()));
    const update = vi.fn(() => Promise.resolve(transactionRecord({ description: 'x' })));
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()),
        update,
      },
      categoriesRepository: { findInHousehold: findInHouseholdCategory },
    });

    await service.updateTransaction(access, transactionId, { description: 'x' });

    expect(findInHouseholdCategory).not.toHaveBeenCalled();
  });

  it('rejects switching to USD without also clearing/keeping a consistent fxRateToBase', async () => {
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()), // PYG, fxRateToBase null
      },
    });

    await expect(
      service.updateTransaction(access, transactionId, { currency: 'USD' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('switches currency to USD when fxRateToBase is provided in the same request', async () => {
    const update = vi.fn<
      (
        householdId: string,
        transactionId: string,
        changes: UpdateTransactionRecordChanges,
      ) => Promise<TransactionRecord | null>
    >(() =>
      Promise.resolve(transactionRecord({ currency: 'USD', fxRateToBase: new Decimal('7350') })),
    );
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()), // PYG amount "150000"
        update,
      },
    });

    await service.updateTransaction(access, transactionId, {
      currency: 'USD',
      fxRateToBase: '7350',
    });

    const changes = update.mock.calls[0]?.[2];
    // existing amount "150000" re-parsed under USD2 scale is still valid (0 decimals <= 2).
    expect(changes?.fxRateToBase?.toFixed(0)).toBe('7350');
    expect(changes?.baseAmountPyg.toFixed(0)).toBe('1102500000');
  });

  it('rejects switching to PYG without explicitly clearing an existing fxRateToBase', async () => {
    const service = createService({
      transactionsRepository: {
        findInHousehold: () =>
          Promise.resolve(
            transactionRecord({ currency: 'USD', fxRateToBase: new Decimal('7350') }),
          ),
      },
    });

    await expect(
      service.updateTransaction(access, transactionId, { currency: 'PYG' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('switches currency to PYG when fxRateToBase is explicitly cleared in the same request', async () => {
    const update = vi.fn<
      (
        householdId: string,
        transactionId: string,
        changes: UpdateTransactionRecordChanges,
      ) => Promise<TransactionRecord | null>
    >(() => Promise.resolve(transactionRecord()));
    const service = createService({
      transactionsRepository: {
        findInHousehold: () =>
          Promise.resolve(
            transactionRecord({
              currency: 'USD',
              amount: new Decimal('10'),
              fxRateToBase: new Decimal('7350'),
            }),
          ),
        update,
      },
    });

    await service.updateTransaction(access, transactionId, {
      currency: 'PYG',
      fxRateToBase: null,
    });

    const changes = update.mock.calls[0]?.[2];
    expect(changes?.fxRateToBase).toBeNull();
    expect(changes?.baseAmountPyg.toFixed(0)).toBe('10');
  });

  it('recomputes localDate when occurredAt changes', async () => {
    const update = vi.fn<
      (
        householdId: string,
        transactionId: string,
        changes: UpdateTransactionRecordChanges,
      ) => Promise<TransactionRecord | null>
    >(() => Promise.resolve(transactionRecord()));
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()),
        update,
      },
    });

    await service.updateTransaction(access, transactionId, {
      occurredAt: '2026-07-20T02:00:00.000Z',
    });

    const changes = update.mock.calls[0]?.[2];
    expect(changes?.localDate.toISOString()).toBe('2026-07-19T00:00:00.000Z');
  });

  it('maps a concurrent removal during update to not found', async () => {
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()),
        update: () => Promise.resolve(null),
      },
    });

    await expect(
      service.updateTransaction(access, transactionId, { description: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TransactionsService delete', () => {
  it('rejects a transaction outside the household as not found', async () => {
    const service = createService({
      transactionsRepository: { findInHousehold: () => Promise.resolve(null) },
    });

    await expect(service.deleteTransaction(access, transactionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('hard-deletes without any archive fallback', async () => {
    const deleteById = vi.fn(() => Promise.resolve(true));
    const service = createService({
      transactionsRepository: {
        findInHousehold: () => Promise.resolve(transactionRecord()),
        deleteById,
      },
    });

    await service.deleteTransaction(access, transactionId);

    expect(deleteById).toHaveBeenCalledWith(access.householdId, transactionId);
  });
});
