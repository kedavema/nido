import { Injectable } from '@nestjs/common';
import {
  FREQUENCY_KINDS,
  SUPPORTED_CURRENCY_CODES,
  TRANSACTION_TYPES,
  type FrequencyKind,
  type SupportedCurrencyCode,
} from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateRecurringItemRecordInput,
  GeneratedOccurrenceInput,
  RecurringItemKind,
  RecurringItemRecord,
  UpdateRecurringItemRecordChanges,
} from './recurring-item.js';
import type { RecurringItemsRepository } from './recurring-items.repository.js';

@Injectable()
export class PrismaRecurringItemsRepository implements RecurringItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string): Promise<readonly RecurringItemRecord[]> {
    const recurringItems = await this.prisma.recurringItem.findMany({
      where: { householdId },
      orderBy: [{ firstDueDate: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return recurringItems.map(toRecurringItemRecord);
  }

  async findInHousehold(
    householdId: string,
    recurringItemId: string,
  ): Promise<RecurringItemRecord | null> {
    const recurringItem = await this.prisma.recurringItem.findFirst({
      where: { id: recurringItemId, householdId },
    });
    return recurringItem === null ? null : toRecurringItemRecord(recurringItem);
  }

  async createWithOccurrences(
    input: CreateRecurringItemRecordInput,
    occurrences: readonly GeneratedOccurrenceInput[],
  ): Promise<RecurringItemRecord> {
    const recurringItem = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.recurringItem.create({
        data: {
          householdId: input.householdId,
          kind: input.kind,
          name: input.name,
          description: input.description,
          categoryId: input.categoryId,
          paymentSourceId: input.paymentSourceId,
          responsibleUserId: input.responsibleUserId,
          estimatedAmount: input.estimatedAmount,
          currency: input.currency,
          plannedFxRateToBase: input.plannedFxRateToBase,
          frequency: input.frequency,
          intervalMonths: input.intervalMonths,
          firstDueDate: input.firstDueDate,
          endDate: input.endDate,
          notificationOffsets: [...input.notificationOffsets],
        },
      });

      if (occurrences.length > 0) {
        await transaction.occurrence.createMany({
          data: occurrences.map((occurrence) => ({
            recurringItemId: created.id,
            householdId: input.householdId,
            dueDate: occurrence.dueDate,
            amount: occurrence.amount,
            currency: occurrence.currency,
            fxRateToBase: occurrence.fxRateToBase,
            responsibleUserId: occurrence.responsibleUserId,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return toRecurringItemRecord(recurringItem);
  }

  async updateWithFutureOccurrences(
    householdId: string,
    recurringItemId: string,
    changes: UpdateRecurringItemRecordChanges,
    regeneration: {
      readonly today: Date;
      readonly occurrences: readonly GeneratedOccurrenceInput[];
    } | null,
  ): Promise<RecurringItemRecord | null> {
    try {
      const recurringItem = await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.recurringItem.update({
          where: { id: recurringItemId, householdId },
          // The transactional client's generics resolve the checked/unchecked update-input XOR
          // less precisely than the top-level client's do (unlike categories'/transactions'
          // `update()`, this one must run inside `$transaction` alongside the occurrence writes),
          // so this is asserted as the unchecked (scalar-FK) variant explicitly instead of
          // letting inference pick an arm.
          data: changes as Prisma.RecurringItemUncheckedUpdateInput,
        });

        // regeneration is null for an inactive (or newly-deactivated) rule: ADR 0009 says
        // deactivating never touches occurrences, so the table is left completely alone.
        if (regeneration !== null) {
          // ADR 0009 point 2: only PENDING occurrences due today-or-later are ever removed here
          // — SETTLED/SKIPPED/OVERDUE rows and past-due PENDING rows are never selected, so they
          // can never be deleted or overwritten by this call.
          await transaction.occurrence.deleteMany({
            where: {
              recurringItemId,
              status: 'PENDING',
              dueDate: { gte: regeneration.today },
            },
          });

          if (regeneration.occurrences.length > 0) {
            await transaction.occurrence.createMany({
              data: regeneration.occurrences.map((occurrence) => ({
                recurringItemId,
                householdId,
                dueDate: occurrence.dueDate,
                amount: occurrence.amount,
                currency: occurrence.currency,
                fxRateToBase: occurrence.fxRateToBase,
                responsibleUserId: occurrence.responsibleUserId,
              })),
              // A due date shared with an untouched SETTLED/SKIPPED/OVERDUE occurrence (never
              // deleted above) is silently skipped instead of colliding with the unique
              // (recurring_item_id, due_date) constraint.
              skipDuplicates: true,
            });
          }
        }

        return updated;
      });

      return toRecurringItemRecord(recurringItem);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deactivate(
    householdId: string,
    recurringItemId: string,
  ): Promise<RecurringItemRecord | null> {
    try {
      const recurringItem = await this.prisma.recurringItem.update({
        where: { id: recurringItemId, householdId },
        data: { isActive: false },
      });
      return toRecurringItemRecord(recurringItem);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }
}

function toRecurringItemRecord(recurringItem: {
  readonly id: string;
  readonly householdId: string;
  readonly kind: string;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: string;
  readonly paymentSourceId: string | null;
  readonly responsibleUserId: string | null;
  readonly estimatedAmount: RecurringItemRecord['estimatedAmount'];
  readonly currency: string;
  readonly plannedFxRateToBase: RecurringItemRecord['plannedFxRateToBase'];
  readonly frequency: string;
  readonly intervalMonths: number | null;
  readonly firstDueDate: Date;
  readonly endDate: Date | null;
  readonly notificationOffsets: readonly number[];
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): RecurringItemRecord {
  return {
    id: recurringItem.id,
    householdId: recurringItem.householdId,
    kind: toRecurringItemKind(recurringItem.kind),
    name: recurringItem.name,
    description: recurringItem.description,
    categoryId: recurringItem.categoryId,
    paymentSourceId: recurringItem.paymentSourceId,
    responsibleUserId: recurringItem.responsibleUserId,
    estimatedAmount: recurringItem.estimatedAmount,
    currency: toSupportedCurrencyCode(recurringItem.currency),
    plannedFxRateToBase: recurringItem.plannedFxRateToBase,
    frequency: toFrequencyKind(recurringItem.frequency),
    intervalMonths: recurringItem.intervalMonths,
    firstDueDate: recurringItem.firstDueDate,
    endDate: recurringItem.endDate,
    notificationOffsets: recurringItem.notificationOffsets,
    isActive: recurringItem.isActive,
    createdAt: recurringItem.createdAt,
    updatedAt: recurringItem.updatedAt,
  };
}

function toRecurringItemKind(value: string): RecurringItemKind {
  if ((TRANSACTION_TYPES as readonly string[]).includes(value)) {
    return value as RecurringItemKind;
  }
  throw new Error('Unsupported recurring item kind');
}

function toSupportedCurrencyCode(value: string): SupportedCurrencyCode {
  if ((SUPPORTED_CURRENCY_CODES as readonly string[]).includes(value)) {
    return value as SupportedCurrencyCode;
  }
  throw new Error('Unsupported recurring item currency');
}

function toFrequencyKind(value: string): FrequencyKind {
  if ((FREQUENCY_KINDS as readonly string[]).includes(value)) {
    return value as FrequencyKind;
  }
  throw new Error('Unsupported recurring item frequency');
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}
