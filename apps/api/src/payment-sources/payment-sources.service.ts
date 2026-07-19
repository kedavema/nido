import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePaymentSourceRequest,
  CreatePaymentSourceResponse,
  ListPaymentSourcesResponse,
  PaymentSource,
  UpdatePaymentSourceRequest,
  UpdatePaymentSourceResponse,
} from '@nido/contracts';

import type { HouseholdAccess } from '../households/household.js';
import {
  HOUSEHOLDS_REPOSITORY,
  type HouseholdsRepository,
} from '../households/households.repository.js';
import type { PaymentSourceRecord, UpdatePaymentSourceRecordChanges } from './payment-source.js';
import {
  PAYMENT_SOURCES_REPOSITORY,
  PaymentSourceInUseError,
  PaymentSourceOwnerMissingError,
  type PaymentSourcesRepository,
} from './payment-sources.repository.js';

const PAYMENT_SOURCE_UNAVAILABLE = 'Payment source is unavailable';
// The owner is informative only (system-design.md §6.2) and never computes
// balances, but it must stay coherent: it has to point at an ACTIVE member of
// the same household.
const OWNER_MUST_BE_ACTIVE_MEMBER =
  'Payment source owner must be an active member of the household';

@Injectable()
export class PaymentSourcesService {
  constructor(
    @Inject(PAYMENT_SOURCES_REPOSITORY)
    private readonly paymentSourcesRepository: PaymentSourcesRepository,
    @Inject(HOUSEHOLDS_REPOSITORY)
    private readonly householdsRepository: HouseholdsRepository,
  ) {}

  async listPaymentSources(access: HouseholdAccess): Promise<ListPaymentSourcesResponse> {
    const paymentSources = await this.paymentSourcesRepository.listForHousehold(access.householdId);
    return { paymentSources: paymentSources.map(toPaymentSource) };
  }

  async createPaymentSource(
    access: HouseholdAccess,
    input: CreatePaymentSourceRequest,
  ): Promise<CreatePaymentSourceResponse> {
    const ownerUserId = input.ownerUserId ?? null;
    if (ownerUserId !== null) {
      await this.assertOwnerIsActiveMember(access.householdId, ownerUserId);
    }

    try {
      const paymentSource = await this.paymentSourcesRepository.create({
        householdId: access.householdId,
        name: input.name,
        type: input.type,
        ownerUserId,
      });
      return { paymentSource: toPaymentSource(paymentSource) };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updatePaymentSource(
    access: HouseholdAccess,
    paymentSourceId: string,
    input: UpdatePaymentSourceRequest,
  ): Promise<UpdatePaymentSourceResponse> {
    const existing = await this.paymentSourcesRepository.findInHousehold(
      access.householdId,
      paymentSourceId,
    );
    if (existing === null) {
      throw new NotFoundException(PAYMENT_SOURCE_UNAVAILABLE);
    }

    if (input.ownerUserId !== undefined && input.ownerUserId !== null) {
      await this.assertOwnerIsActiveMember(access.householdId, input.ownerUserId);
    }

    const changes: UpdatePaymentSourceRecordChanges = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    let updated: PaymentSourceRecord | null;
    try {
      updated = await this.paymentSourcesRepository.update(
        access.householdId,
        paymentSourceId,
        changes,
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }

    if (updated === null) {
      throw new NotFoundException(PAYMENT_SOURCE_UNAVAILABLE);
    }

    return { paymentSource: toPaymentSource(updated) };
  }

  /**
   * Hard-deletes while nothing references the payment source and falls back
   * to archiving when a reference check fails, mirroring the categories
   * decision. Until M3 transactions land nothing references payment sources,
   * so DELETE always hard-deletes today; the fallback keeps the structure
   * ready for the transaction foreign key.
   */
  async deletePaymentSource(access: HouseholdAccess, paymentSourceId: string): Promise<void> {
    const existing = await this.paymentSourcesRepository.findInHousehold(
      access.householdId,
      paymentSourceId,
    );
    if (existing === null) {
      throw new NotFoundException(PAYMENT_SOURCE_UNAVAILABLE);
    }

    try {
      await this.paymentSourcesRepository.deleteById(access.householdId, paymentSourceId);
    } catch (error) {
      if (error instanceof PaymentSourceInUseError) {
        await this.paymentSourcesRepository.archive(access.householdId, paymentSourceId);
        return;
      }
      throw error;
    }
  }

  private async assertOwnerIsActiveMember(householdId: string, ownerUserId: string): Promise<void> {
    const membership = await this.householdsRepository.findActiveAccess(ownerUserId, householdId);
    if (membership === null) {
      throw new BadRequestException(OWNER_MUST_BE_ACTIVE_MEMBER);
    }
  }
}

function mapPersistenceError(error: unknown): unknown {
  if (error instanceof PaymentSourceOwnerMissingError) {
    return new BadRequestException(OWNER_MUST_BE_ACTIVE_MEMBER);
  }
  return error;
}

function toPaymentSource(record: PaymentSourceRecord): PaymentSource {
  return {
    id: record.id,
    householdId: record.householdId,
    name: record.name,
    type: record.type,
    ownerUserId: record.ownerUserId,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
