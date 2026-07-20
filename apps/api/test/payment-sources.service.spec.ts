import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { HouseholdAccess } from '../src/households/household.js';
import type { HouseholdsRepository } from '../src/households/households.repository.js';
import type { PaymentSourceRecord } from '../src/payment-sources/payment-source.js';
import {
  PaymentSourceInUseError,
  PaymentSourceOwnerMissingError,
  type PaymentSourcesRepository,
} from '../src/payment-sources/payment-sources.repository.js';
import { PaymentSourcesService } from '../src/payment-sources/payment-sources.service.js';

const now = new Date('2026-07-19T12:00:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};
const paymentSourceId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const otherId = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const memberUserId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';

function paymentSourceRecord(overrides: Partial<PaymentSourceRecord> = {}): PaymentSourceRecord {
  return {
    id: paymentSourceId,
    householdId: access.householdId,
    name: 'Ueno Kevin',
    type: 'BANK_ACCOUNT',
    ownerUserId: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRepository(
  overrides: Partial<PaymentSourcesRepository> = {},
): PaymentSourcesRepository {
  return {
    listForHousehold: () => Promise.resolve([]),
    findInHousehold: () => Promise.resolve(null),
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
    findActiveAccess: () => Promise.resolve(null),
    findDetail: () => Promise.reject(new Error('not used')),
    listMembers: () => Promise.reject(new Error('not used')),
    createInvite: () => Promise.reject(new Error('not used')),
    acceptInvite: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

function memberAccess(userId: string): HouseholdAccess {
  return { actorId: userId, householdId: access.householdId, role: 'MEMBER', joinedAt: now };
}

describe('PaymentSourcesService list', () => {
  it('lists every payment source of the household, including archived ones', async () => {
    const listForHousehold = vi.fn(() =>
      Promise.resolve([
        paymentSourceRecord(),
        paymentSourceRecord({ id: otherId, name: 'Old Wallet', type: 'CASH', isActive: false }),
      ]),
    );
    const service = new PaymentSourcesService(
      createRepository({ listForHousehold }),
      createHouseholdsRepository(),
    );

    const response = await service.listPaymentSources(access);

    expect(response.paymentSources).toHaveLength(2);
    expect(response.paymentSources[0]).toEqual({
      id: paymentSourceId,
      householdId: access.householdId,
      name: 'Ueno Kevin',
      type: 'BANK_ACCOUNT',
      ownerUserId: null,
      isActive: true,
      createdAt: '2026-07-19T12:00:00.000Z',
      updatedAt: '2026-07-19T12:00:00.000Z',
    });
    expect(response.paymentSources[1]?.isActive).toBe(false);
    expect(listForHousehold).toHaveBeenCalledWith(access.householdId);
  });
});

describe('PaymentSourcesService create', () => {
  it('creates a payment source without an owner', async () => {
    const create = vi.fn(() => Promise.resolve(paymentSourceRecord()));
    const service = new PaymentSourcesService(
      createRepository({ create }),
      createHouseholdsRepository(),
    );

    const response = await service.createPaymentSource(access, {
      name: 'Ueno Kevin',
      type: 'BANK_ACCOUNT',
    });

    expect(response.paymentSource.id).toBe(paymentSourceId);
    expect(create).toHaveBeenCalledWith({
      householdId: access.householdId,
      name: 'Ueno Kevin',
      type: 'BANK_ACCOUNT',
      ownerUserId: null,
    });
  });

  it('creates a payment source owned by an active household member', async () => {
    const create = vi.fn(() => Promise.resolve(paymentSourceRecord({ ownerUserId: memberUserId })));
    const findActiveAccess = vi.fn(() => Promise.resolve(memberAccess(memberUserId)));
    const service = new PaymentSourcesService(
      createRepository({ create }),
      createHouseholdsRepository({ findActiveAccess }),
    );

    const response = await service.createPaymentSource(access, {
      name: 'Cuenta Ale',
      type: 'BANK_ACCOUNT',
      ownerUserId: memberUserId,
    });

    expect(response.paymentSource.ownerUserId).toBe(memberUserId);
    expect(findActiveAccess).toHaveBeenCalledWith(memberUserId, access.householdId);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: memberUserId }));
  });

  it('rejects an owner that is not an active member of the household', async () => {
    const create = vi.fn(() => Promise.resolve(paymentSourceRecord()));
    const service = new PaymentSourcesService(
      createRepository({ create }),
      createHouseholdsRepository({ findActiveAccess: vi.fn(() => Promise.resolve(null)) }),
    );

    await expect(
      service.createPaymentSource(access, {
        name: 'Cuenta Ajena',
        type: 'BANK_ACCOUNT',
        ownerUserId: memberUserId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps an owner that vanished mid-flight to a bad request', async () => {
    const service = new PaymentSourcesService(
      createRepository({
        create: vi.fn(() => Promise.reject(new PaymentSourceOwnerMissingError())),
      }),
      createHouseholdsRepository({
        findActiveAccess: vi.fn(() => Promise.resolve(memberAccess(memberUserId))),
      }),
    );

    await expect(
      service.createPaymentSource(access, {
        name: 'Cuenta Ale',
        type: 'BANK_ACCOUNT',
        ownerUserId: memberUserId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentSourcesService update', () => {
  it('rejects a payment source outside the household as not found', async () => {
    const service = new PaymentSourcesService(
      createRepository({ findInHousehold: vi.fn(() => Promise.resolve(null)) }),
      createHouseholdsRepository(),
    );

    await expect(
      service.updatePaymentSource(access, paymentSourceId, { name: 'Efectivo' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renames a payment source passing only the changed fields', async () => {
    const update = vi.fn(() => Promise.resolve(paymentSourceRecord({ name: 'Efectivo' })));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        update,
      }),
      createHouseholdsRepository(),
    );

    const response = await service.updatePaymentSource(access, paymentSourceId, {
      name: 'Efectivo',
    });

    expect(response.paymentSource.name).toBe('Efectivo');
    expect(update).toHaveBeenCalledWith(access.householdId, paymentSourceId, { name: 'Efectivo' });
  });

  it('changes the type, as the contract allows', async () => {
    const update = vi.fn(() => Promise.resolve(paymentSourceRecord({ type: 'CREDIT_CARD' })));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        update,
      }),
      createHouseholdsRepository(),
    );

    const response = await service.updatePaymentSource(access, paymentSourceId, {
      type: 'CREDIT_CARD',
    });

    expect(response.paymentSource.type).toBe('CREDIT_CARD');
    expect(update).toHaveBeenCalledWith(access.householdId, paymentSourceId, {
      type: 'CREDIT_CARD',
    });
  });

  it('sets an owner after validating active membership', async () => {
    const update = vi.fn(() => Promise.resolve(paymentSourceRecord({ ownerUserId: memberUserId })));
    const findActiveAccess = vi.fn(() => Promise.resolve(memberAccess(memberUserId)));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        update,
      }),
      createHouseholdsRepository({ findActiveAccess }),
    );

    const response = await service.updatePaymentSource(access, paymentSourceId, {
      ownerUserId: memberUserId,
    });

    expect(response.paymentSource.ownerUserId).toBe(memberUserId);
    expect(findActiveAccess).toHaveBeenCalledWith(memberUserId, access.householdId);
  });

  it('rejects setting an owner that is not an active member', async () => {
    const update = vi.fn(() => Promise.resolve(paymentSourceRecord()));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        update,
      }),
      createHouseholdsRepository({ findActiveAccess: vi.fn(() => Promise.resolve(null)) }),
    );

    await expect(
      service.updatePaymentSource(access, paymentSourceId, { ownerUserId: memberUserId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the owner without a membership check', async () => {
    const update = vi.fn(() => Promise.resolve(paymentSourceRecord({ ownerUserId: null })));
    const findActiveAccess = vi.fn(() => Promise.resolve(null));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() =>
          Promise.resolve(paymentSourceRecord({ ownerUserId: memberUserId })),
        ),
        update,
      }),
      createHouseholdsRepository({ findActiveAccess }),
    );

    const response = await service.updatePaymentSource(access, paymentSourceId, {
      ownerUserId: null,
    });

    expect(response.paymentSource.ownerUserId).toBeNull();
    expect(findActiveAccess).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(access.householdId, paymentSourceId, {
      ownerUserId: null,
    });
  });

  it('skips the membership check when the owner is not part of the change', async () => {
    const findActiveAccess = vi.fn(() => Promise.resolve(null));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() =>
          Promise.resolve(paymentSourceRecord({ ownerUserId: memberUserId })),
        ),
        update: vi.fn(() =>
          Promise.resolve(paymentSourceRecord({ ownerUserId: memberUserId, name: 'Ueno TC' })),
        ),
      }),
      createHouseholdsRepository({ findActiveAccess }),
    );

    await expect(
      service.updatePaymentSource(access, paymentSourceId, { name: 'Ueno TC' }),
    ).resolves.toBeDefined();
    expect(findActiveAccess).not.toHaveBeenCalled();
  });

  it('archives and unarchives via isActive', async () => {
    const update = vi.fn(() => Promise.resolve(paymentSourceRecord({ isActive: false })));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        update,
      }),
      createHouseholdsRepository(),
    );

    const response = await service.updatePaymentSource(access, paymentSourceId, {
      isActive: false,
    });

    expect(response.paymentSource.isActive).toBe(false);
    expect(update).toHaveBeenCalledWith(access.householdId, paymentSourceId, { isActive: false });
  });

  it('maps a concurrent removal during update to not found', async () => {
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        update: vi.fn(() => Promise.resolve(null)),
      }),
      createHouseholdsRepository(),
    );

    await expect(
      service.updatePaymentSource(access, paymentSourceId, { name: 'Efectivo' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps an owner that vanished mid-flight to a bad request', async () => {
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        update: vi.fn(() => Promise.reject(new PaymentSourceOwnerMissingError())),
      }),
      createHouseholdsRepository({
        findActiveAccess: vi.fn(() => Promise.resolve(memberAccess(memberUserId))),
      }),
    );

    await expect(
      service.updatePaymentSource(access, paymentSourceId, { ownerUserId: memberUserId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentSourcesService delete', () => {
  it('rejects a payment source outside the household as not found', async () => {
    const service = new PaymentSourcesService(
      createRepository({ findInHousehold: vi.fn(() => Promise.resolve(null)) }),
      createHouseholdsRepository(),
    );

    await expect(service.deletePaymentSource(access, paymentSourceId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('hard-deletes a payment source without references', async () => {
    const archive = vi.fn(() => Promise.resolve(paymentSourceRecord({ isActive: false })));
    const deleteById = vi.fn(() => Promise.resolve(true));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        archive,
        deleteById,
      }),
      createHouseholdsRepository(),
    );

    await service.deletePaymentSource(access, paymentSourceId);

    expect(deleteById).toHaveBeenCalledWith(access.householdId, paymentSourceId);
    expect(archive).not.toHaveBeenCalled();
  });

  it('falls back to archiving when references exist', async () => {
    const archive = vi.fn(() => Promise.resolve(paymentSourceRecord({ isActive: false })));
    const service = new PaymentSourcesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(paymentSourceRecord())),
        deleteById: vi.fn(() => Promise.reject(new PaymentSourceInUseError())),
        archive,
      }),
      createHouseholdsRepository(),
    );

    await service.deletePaymentSource(access, paymentSourceId);

    expect(archive).toHaveBeenCalledWith(access.householdId, paymentSourceId);
  });
});
