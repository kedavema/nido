import { BadRequestException } from '@nestjs/common';
import type { CreateTransactionRequest, CreateTransactionResponse } from '@nido/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { HouseholdAccess } from '../src/households/household.js';
import { TransactionsController } from '../src/transactions/transactions.controller.js';
import type { TransactionsService } from '../src/transactions/transactions.service.js';

const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: new Date('2026-07-19T12:00:00.000Z'),
};

const clientMutationId = '1a2b3c4d-5e6f-4708-9a0b-1c2d3e4f5061';

function createInput(overrides: Partial<CreateTransactionRequest> = {}): CreateTransactionRequest {
  return {
    type: 'EXPENSE',
    amount: '150000',
    currency: 'PYG',
    occurredAt: '2026-07-19T12:00:00.000Z',
    categoryId: '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f',
    description: 'Supermercado',
    ...overrides,
  };
}

function createController(
  createTransaction: (
    access: HouseholdAccess,
    input: CreateTransactionRequest,
  ) => Promise<CreateTransactionResponse> = () => Promise.reject(new Error('not used')),
): TransactionsController {
  const service = { createTransaction } as unknown as TransactionsService;
  return new TransactionsController(service);
}

// ADR 0003: the controller enforces the header/body idempotency-key agreement before any
// service or DB work happens.
describe('TransactionsController createTransaction idempotency header', () => {
  it('rejects a clientMutationId without a matching Idempotency-Key header with 400', () => {
    const createTransaction = vi.fn();
    const controller = createController(createTransaction);

    expect(() =>
      controller.createTransaction(access, createInput({ clientMutationId }), undefined),
    ).toThrow(BadRequestException);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('rejects a clientMutationId whose Idempotency-Key header does not match it with 400', () => {
    const createTransaction = vi.fn();
    const controller = createController(createTransaction);

    expect(() =>
      controller.createTransaction(
        access,
        createInput({ clientMutationId }),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toThrow(BadRequestException);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('accepts a clientMutationId whose Idempotency-Key header matches it', async () => {
    const createTransaction = vi.fn(() =>
      Promise.resolve({
        transaction: { id: 'irrelevant' },
      } as unknown as CreateTransactionResponse),
    );
    const controller = createController(createTransaction);

    await controller.createTransaction(access, createInput({ clientMutationId }), clientMutationId);

    expect(createTransaction).toHaveBeenCalledWith(
      access,
      expect.objectContaining({ clientMutationId }),
    );
  });

  it('ignores the Idempotency-Key header entirely when clientMutationId is absent (back-compat)', async () => {
    const createTransaction = vi.fn(() =>
      Promise.resolve({
        transaction: { id: 'irrelevant' },
      } as unknown as CreateTransactionResponse),
    );
    const controller = createController(createTransaction);

    await controller.createTransaction(access, createInput(), undefined);

    expect(createTransaction).toHaveBeenCalledWith(access, expect.objectContaining(createInput()));
  });
});
