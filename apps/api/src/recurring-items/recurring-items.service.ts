import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FrequencyKind } from '@nido/domain-types';
import type {
  CreateRecurringItemRequest,
  CreateRecurringItemResponse,
  ListRecurringItemsResponse,
  RecurringItem,
  UpdateRecurringItemRequest,
  UpdateRecurringItemResponse,
} from '@nido/contracts';

import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import { Prisma } from '../generated/prisma/client.js';
import type { HouseholdAccess } from '../households/household.js';
import {
  HOUSEHOLDS_REPOSITORY,
  type HouseholdsRepository,
} from '../households/households.repository.js';
import {
  PAYMENT_SOURCES_REPOSITORY,
  type PaymentSourcesRepository,
} from '../payment-sources/payment-sources.repository.js';
import { formatLocalDate, parseLocalDate } from '../transactions/local-date.js';
import {
  AmountCurrencyScaleError,
  assertAmountCurrencyConsistency,
  FxRateRequirementError,
  type AmountCurrencyConsistencyInput,
} from '../transactions/money.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { generateOccurrenceSchedule, truncateToUtcDate } from './occurrence-generation.js';
import type {
  GeneratedOccurrenceInput,
  RecurringItemRecord,
  UpdateRecurringItemRecordChanges,
} from './recurring-item.js';
import {
  RECURRING_ITEMS_REPOSITORY,
  type RecurringItemsRepository,
} from './recurring-items.repository.js';

const RECURRING_ITEM_UNAVAILABLE = 'Recurring item is unavailable';
const CATEGORY_MUST_MATCH_KIND =
  'Recurring item category must belong to the household and match the recurring item kind';
const PAYMENT_SOURCE_MUST_BELONG_TO_HOUSEHOLD =
  'Recurring item payment source must belong to the household';
const RESPONSIBLE_USER_MUST_BE_ACTIVE_MEMBER =
  'Recurring item responsible user must be an active member of the household';
const INTERVAL_MONTHS_REQUIRED = 'intervalMonths is required for EVERY_N_MONTHS frequency';
const INTERVAL_MONTHS_FORBIDDEN =
  'intervalMonths must be absent unless frequency is EVERY_N_MONTHS';

@Injectable()
export class RecurringItemsService {
  constructor(
    @Inject(RECURRING_ITEMS_REPOSITORY)
    private readonly recurringItemsRepository: RecurringItemsRepository,
    @Inject(CATEGORIES_REPOSITORY)
    private readonly categoriesRepository: CategoriesRepository,
    @Inject(PAYMENT_SOURCES_REPOSITORY)
    private readonly paymentSourcesRepository: PaymentSourcesRepository,
    @Inject(HOUSEHOLDS_REPOSITORY)
    private readonly householdsRepository: HouseholdsRepository,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async listRecurringItems(access: HouseholdAccess): Promise<ListRecurringItemsResponse> {
    const recurringItems = await this.recurringItemsRepository.list(access.householdId);
    return { recurringItems: recurringItems.map(toRecurringItem) };
  }

  async getRecurringItem(
    access: HouseholdAccess,
    recurringItemId: string,
  ): Promise<{ recurringItem: RecurringItem }> {
    const recurringItem = await this.recurringItemsRepository.findInHousehold(
      access.householdId,
      recurringItemId,
    );
    if (recurringItem === null) {
      throw new NotFoundException(RECURRING_ITEM_UNAVAILABLE);
    }
    return { recurringItem: toRecurringItem(recurringItem) };
  }

  /**
   * ADR 0009 point 1: creating a rule generates every `PENDING` occurrence within the 12-month
   * horizon from `firstDueDate`, atomically with the rule row (see
   * `PrismaRecurringItemsRepository.createWithOccurrences`).
   */
  async createRecurringItem(
    access: HouseholdAccess,
    input: CreateRecurringItemRequest,
  ): Promise<CreateRecurringItemResponse> {
    await this.assertValidCategory(access.householdId, input.categoryId, input.kind);

    const paymentSourceId = input.paymentSourceId ?? null;
    if (paymentSourceId !== null) {
      await this.assertValidPaymentSource(access.householdId, paymentSourceId);
    }

    const responsibleUserId = input.responsibleUserId ?? null;
    if (responsibleUserId !== null) {
      await this.assertValidResponsibleUser(access.householdId, responsibleUserId);
    }

    const intervalMonths = input.intervalMonths ?? null;
    this.assertFrequencyIntervalConsistency(input.frequency, intervalMonths);

    const plannedFxRateToBase = input.plannedFxRateToBase ?? null;
    this.assertMoneyConsistency({
      currency: input.currency,
      amount: input.estimatedAmount,
      fxRateToBase: plannedFxRateToBase,
    });

    const firstDueDate = parseLocalDate(input.firstDueDate);
    const endDate = input.endDate !== undefined ? parseLocalDate(input.endDate) : null;
    const estimatedAmount = new Prisma.Decimal(input.estimatedAmount);
    const fxRateToBase =
      plannedFxRateToBase === null ? null : new Prisma.Decimal(plannedFxRateToBase);

    const occurrences = generateOccurrenceSchedule({
      firstDueDate,
      frequency: input.frequency,
      intervalMonths,
      endDate,
    }).map((dueDate): GeneratedOccurrenceInput => ({
      dueDate,
      amount: estimatedAmount,
      currency: input.currency,
      fxRateToBase,
      responsibleUserId,
    }));

    const created = await this.recurringItemsRepository.createWithOccurrences(
      {
        householdId: access.householdId,
        kind: input.kind,
        name: input.name,
        description: input.description ?? null,
        categoryId: input.categoryId,
        paymentSourceId,
        responsibleUserId,
        estimatedAmount,
        currency: input.currency,
        plannedFxRateToBase: fxRateToBase,
        frequency: input.frequency,
        intervalMonths,
        firstDueDate,
        endDate,
        notificationOffsets: input.notificationOffsets ?? [],
      },
      occurrences,
    );

    return { recurringItem: toRecurringItem(created) };
  }

  /**
   * ADR 0009 point 2: editing an active rule regenerates only the `PENDING` occurrences that are
   * still due today-or-later within the (possibly shifted) 12-month horizon; `SETTLED`,
   * `SKIPPED`, `OVERDUE`, and past-due `PENDING` occurrences are never touched. When the rule is
   * (or is becoming) inactive, occurrences are left completely alone — deactivating a rule stops
   * future generation but never deletes or edits anything already generated.
   */
  async updateRecurringItem(
    access: HouseholdAccess,
    recurringItemId: string,
    input: UpdateRecurringItemRequest,
  ): Promise<UpdateRecurringItemResponse> {
    const existing = await this.recurringItemsRepository.findInHousehold(
      access.householdId,
      recurringItemId,
    );
    if (existing === null) {
      throw new NotFoundException(RECURRING_ITEM_UNAVAILABLE);
    }

    const effectiveKind = input.kind ?? existing.kind;
    const effectiveCategoryId = input.categoryId ?? existing.categoryId;
    if (input.kind !== undefined || input.categoryId !== undefined) {
      await this.assertValidCategory(access.householdId, effectiveCategoryId, effectiveKind);
    }

    const effectivePaymentSourceId =
      input.paymentSourceId === undefined ? existing.paymentSourceId : input.paymentSourceId;
    if (input.paymentSourceId !== undefined && effectivePaymentSourceId !== null) {
      await this.assertValidPaymentSource(access.householdId, effectivePaymentSourceId);
    }

    const effectiveResponsibleUserId =
      input.responsibleUserId === undefined ? existing.responsibleUserId : input.responsibleUserId;
    if (input.responsibleUserId !== undefined && effectiveResponsibleUserId !== null) {
      await this.assertValidResponsibleUser(access.householdId, effectiveResponsibleUserId);
    }

    const effectiveFrequency = input.frequency ?? existing.frequency;
    const effectiveIntervalMonths =
      input.intervalMonths !== undefined ? input.intervalMonths : existing.intervalMonths;
    this.assertFrequencyIntervalConsistency(effectiveFrequency, effectiveIntervalMonths);

    const effectiveCurrency = input.currency ?? existing.currency;
    const effectiveEstimatedAmount = input.estimatedAmount ?? existing.estimatedAmount.toString();
    const effectivePlannedFxRateToBase =
      input.plannedFxRateToBase === undefined
        ? existing.plannedFxRateToBase === null
          ? null
          : existing.plannedFxRateToBase.toString()
        : input.plannedFxRateToBase;
    this.assertMoneyConsistency({
      currency: effectiveCurrency,
      amount: effectiveEstimatedAmount,
      fxRateToBase: effectivePlannedFxRateToBase,
    });

    const effectiveFirstDueDate =
      input.firstDueDate !== undefined ? parseLocalDate(input.firstDueDate) : existing.firstDueDate;
    const effectiveEndDate =
      input.endDate === undefined
        ? existing.endDate
        : input.endDate === null
          ? null
          : parseLocalDate(input.endDate);
    const effectiveIsActive = input.isActive ?? existing.isActive;

    const estimatedAmountDecimal = new Prisma.Decimal(effectiveEstimatedAmount);
    const fxRateToBaseDecimal =
      effectivePlannedFxRateToBase === null
        ? null
        : new Prisma.Decimal(effectivePlannedFxRateToBase);

    const changes: UpdateRecurringItemRecordChanges = {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.paymentSourceId !== undefined ? { paymentSourceId: input.paymentSourceId } : {}),
      ...(input.responsibleUserId !== undefined
        ? { responsibleUserId: input.responsibleUserId }
        : {}),
      ...(input.estimatedAmount !== undefined ? { estimatedAmount: estimatedAmountDecimal } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.plannedFxRateToBase !== undefined
        ? { plannedFxRateToBase: fxRateToBaseDecimal }
        : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.intervalMonths !== undefined ? { intervalMonths: input.intervalMonths } : {}),
      ...(input.firstDueDate !== undefined ? { firstDueDate: effectiveFirstDueDate } : {}),
      ...(input.endDate !== undefined ? { endDate: effectiveEndDate } : {}),
      ...(input.notificationOffsets !== undefined
        ? { notificationOffsets: input.notificationOffsets }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    const regeneration = effectiveIsActive
      ? this.buildRegeneration({
          firstDueDate: effectiveFirstDueDate,
          frequency: effectiveFrequency,
          intervalMonths: effectiveIntervalMonths,
          endDate: effectiveEndDate,
          amount: estimatedAmountDecimal,
          currency: effectiveCurrency,
          fxRateToBase: fxRateToBaseDecimal,
          responsibleUserId: effectiveResponsibleUserId,
        })
      : null;

    const updated = await this.recurringItemsRepository.updateWithFutureOccurrences(
      access.householdId,
      recurringItemId,
      changes,
      regeneration,
    );
    if (updated === null) {
      throw new NotFoundException(RECURRING_ITEM_UNAVAILABLE);
    }

    return { recurringItem: toRecurringItem(updated) };
  }

  /**
   * DELETE deactivates rather than hard-deletes: `Occurrence.recurringItemId` cascades on
   * delete (see `apps/api/prisma/schema.prisma`), so hard-deleting a rule would silently wipe
   * every occurrence it ever generated, including `SETTLED` ones tied to real transactions. ADR
   * 0009 already defines the safe operation — "Desactivar una regla (is_active = false) detiene
   * la generación futura pero no borra ni cambia ocurrencias ya generadas" — so this mirrors
   * `categories`/`payment-sources`' archive-on-delete pattern instead of `transactions`' hard
   * delete (which has no downstream rows to protect).
   */
  async deleteRecurringItem(access: HouseholdAccess, recurringItemId: string): Promise<void> {
    const existing = await this.recurringItemsRepository.findInHousehold(
      access.householdId,
      recurringItemId,
    );
    if (existing === null) {
      throw new NotFoundException(RECURRING_ITEM_UNAVAILABLE);
    }

    await this.recurringItemsRepository.deactivate(access.householdId, recurringItemId);
  }

  private buildRegeneration(input: {
    readonly firstDueDate: Date;
    readonly frequency: FrequencyKind;
    readonly intervalMonths: number | null;
    readonly endDate: Date | null;
    readonly amount: Prisma.Decimal;
    readonly currency: RecurringItemRecord['currency'];
    readonly fxRateToBase: Prisma.Decimal | null;
    readonly responsibleUserId: string | null;
  }): { readonly today: Date; readonly occurrences: readonly GeneratedOccurrenceInput[] } {
    const today = truncateToUtcDate(this.clock.now());
    const occurrences = generateOccurrenceSchedule({
      firstDueDate: input.firstDueDate,
      frequency: input.frequency,
      intervalMonths: input.intervalMonths,
      endDate: input.endDate,
    })
      .filter((dueDate) => dueDate.getTime() >= today.getTime())
      .map((dueDate): GeneratedOccurrenceInput => ({
        dueDate,
        amount: input.amount,
        currency: input.currency,
        fxRateToBase: input.fxRateToBase,
        responsibleUserId: input.responsibleUserId,
      }));
    return { today, occurrences };
  }

  private async assertValidCategory(
    householdId: string,
    categoryId: string,
    kind: RecurringItem['kind'],
  ): Promise<void> {
    const category = await this.categoriesRepository.findInHousehold(householdId, categoryId);
    if (category?.kind !== kind) {
      throw new BadRequestException(CATEGORY_MUST_MATCH_KIND);
    }
  }

  private async assertValidPaymentSource(
    householdId: string,
    paymentSourceId: string,
  ): Promise<void> {
    const paymentSource = await this.paymentSourcesRepository.findInHousehold(
      householdId,
      paymentSourceId,
    );
    if (paymentSource === null) {
      throw new BadRequestException(PAYMENT_SOURCE_MUST_BELONG_TO_HOUSEHOLD);
    }
  }

  private async assertValidResponsibleUser(
    householdId: string,
    responsibleUserId: string,
  ): Promise<void> {
    const access = await this.householdsRepository.findActiveAccess(responsibleUserId, householdId);
    if (access === null) {
      throw new BadRequestException(RESPONSIBLE_USER_MUST_BE_ACTIVE_MEMBER);
    }
  }

  private assertFrequencyIntervalConsistency(
    frequency: FrequencyKind,
    intervalMonths: number | null,
  ): void {
    if (frequency === 'EVERY_N_MONTHS' && intervalMonths === null) {
      throw new BadRequestException(INTERVAL_MONTHS_REQUIRED);
    }
    if (frequency !== 'EVERY_N_MONTHS' && intervalMonths !== null) {
      throw new BadRequestException(INTERVAL_MONTHS_FORBIDDEN);
    }
  }

  /**
   * Re-checks, server-side, the same PYG-integral/USD-2-decimal + USD-requires-fx-rate rule
   * `packages/contracts/src/recurring-items.ts` enforces via `superRefine` on create. A partial
   * update payload alone cannot re-check this when only one of `currency`/`estimatedAmount` is
   * present (see `UpdateRecurringItemRequestSchema`'s comment), so this merges the update with
   * the persisted row into an effective state first, mirroring
   * `TransactionsService.validateAndComputeBaseAmountPyg`. Reuses
   * `transactions/money.ts`'s `assertAmountCurrencyConsistency` directly instead of
   * reimplementing the same scale/fx-rate rule a second time — it is currency-generic and
   * already the accepted implementation of this exact cross-field check.
   */
  private assertMoneyConsistency(input: AmountCurrencyConsistencyInput): void {
    try {
      assertAmountCurrencyConsistency(input);
    } catch (error) {
      if (error instanceof AmountCurrencyScaleError || error instanceof FxRateRequirementError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

function toRecurringItem(record: RecurringItemRecord): RecurringItem {
  return {
    id: record.id,
    householdId: record.householdId,
    kind: record.kind,
    name: record.name,
    description: record.description,
    categoryId: record.categoryId,
    paymentSourceId: record.paymentSourceId,
    responsibleUserId: record.responsibleUserId,
    estimatedAmount: record.estimatedAmount.toFixed(record.currency === 'PYG' ? 0 : 2),
    currency: record.currency,
    plannedFxRateToBase:
      record.plannedFxRateToBase === null ? null : record.plannedFxRateToBase.toString(),
    frequency: record.frequency,
    intervalMonths: record.intervalMonths,
    firstDueDate: formatLocalDate(record.firstDueDate),
    endDate: record.endDate === null ? null : formatLocalDate(record.endDate),
    notificationOffsets: [...record.notificationOffsets],
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
