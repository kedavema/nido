import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateTransactionRequest,
  CreateTransactionResponse,
  ListTransactionsQuery,
  ListTransactionsResponse,
  Transaction,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
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
import { deriveLocalDate, formatLocalDate, parseLocalDate } from './local-date.js';
import {
  AmountCurrencyScaleError,
  assertAmountCurrencyConsistency,
  BaseAmountPygOverflowError,
  computeBaseAmountPyg,
  FxRateRequirementError,
} from './money.js';
import type { TransactionRecord, UpdateTransactionRecordChanges } from './transaction.js';
import {
  TRANSACTIONS_REPOSITORY,
  TransactionCategoryInvalidError,
  TransactionPaymentSourceInvalidError,
  type TransactionsRepository,
} from './transactions.repository.js';

const TRANSACTION_UNAVAILABLE = 'Transaction is unavailable';
const HOUSEHOLD_UNAVAILABLE = 'Household is unavailable';
const CATEGORY_MUST_MATCH_TYPE =
  'Transaction category must belong to the household and match the transaction type';
const PAYMENT_SOURCE_MUST_BELONG_TO_HOUSEHOLD =
  'Transaction payment source must belong to the household';

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY)
    private readonly transactionsRepository: TransactionsRepository,
    @Inject(CATEGORIES_REPOSITORY)
    private readonly categoriesRepository: CategoriesRepository,
    @Inject(PAYMENT_SOURCES_REPOSITORY)
    private readonly paymentSourcesRepository: PaymentSourcesRepository,
    @Inject(HOUSEHOLDS_REPOSITORY)
    private readonly householdsRepository: HouseholdsRepository,
  ) {}

  async listTransactions(
    access: HouseholdAccess,
    query: ListTransactionsQuery,
  ): Promise<ListTransactionsResponse> {
    const transactions = await this.transactionsRepository.list(access.householdId, {
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
      ...(query.paymentSourceId !== undefined ? { paymentSourceId: query.paymentSourceId } : {}),
      ...(query.createdBy !== undefined ? { createdBy: query.createdBy } : {}),
      ...(query.currency !== undefined ? { currency: query.currency } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
    });
    return { transactions: transactions.map(toTransaction) };
  }

  async getTransaction(
    access: HouseholdAccess,
    transactionId: string,
  ): Promise<{ transaction: Transaction }> {
    const transaction = await this.transactionsRepository.findInHousehold(
      access.householdId,
      transactionId,
    );
    if (transaction === null) {
      throw new NotFoundException(TRANSACTION_UNAVAILABLE);
    }
    return { transaction: toTransaction(transaction) };
  }

  async createTransaction(
    access: HouseholdAccess,
    input: CreateTransactionRequest,
  ): Promise<CreateTransactionResponse> {
    await this.assertValidCategory(access.householdId, input.categoryId, input.type);

    const paymentSourceId = input.paymentSourceId ?? null;
    if (paymentSourceId !== null) {
      await this.assertValidPaymentSource(access.householdId, paymentSourceId);
    }

    const fxRateToBase = input.fxRateToBase ?? null;
    const baseAmountPyg = this.validateAndComputeBaseAmountPyg({
      currency: input.currency,
      amount: input.amount,
      fxRateToBase,
    });

    const timezone = await this.getHouseholdTimezone(access);
    const occurredAt = new Date(input.occurredAt);
    const localDate = deriveLocalDate(occurredAt, timezone);

    try {
      const transaction = await this.transactionsRepository.create({
        householdId: access.householdId,
        type: input.type,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        fxRateToBase: fxRateToBase === null ? null : new Prisma.Decimal(fxRateToBase),
        baseAmountPyg,
        occurredAt,
        localDate: parseLocalDate(localDate),
        categoryId: input.categoryId,
        paymentSourceId,
        description: input.description,
        notes: input.notes ?? null,
        createdBy: access.actorId,
        updatedBy: access.actorId,
      });
      return { transaction: toTransaction(transaction) };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updateTransaction(
    access: HouseholdAccess,
    transactionId: string,
    input: UpdateTransactionRequest,
  ): Promise<UpdateTransactionResponse> {
    const existing = await this.transactionsRepository.findInHousehold(
      access.householdId,
      transactionId,
    );
    if (existing === null) {
      throw new NotFoundException(TRANSACTION_UNAVAILABLE);
    }

    const effectiveType = input.type ?? existing.type;
    const effectiveCategoryId = input.categoryId ?? existing.categoryId;
    if (input.type !== undefined || input.categoryId !== undefined) {
      await this.assertValidCategory(access.householdId, effectiveCategoryId, effectiveType);
    }

    const effectivePaymentSourceId =
      input.paymentSourceId === undefined ? existing.paymentSourceId : input.paymentSourceId;
    if (input.paymentSourceId !== undefined && effectivePaymentSourceId !== null) {
      await this.assertValidPaymentSource(access.householdId, effectivePaymentSourceId);
    }

    const effectiveCurrency = input.currency ?? existing.currency;
    const effectiveAmount = input.amount ?? existing.amount.toString();
    const effectiveFxRateToBase =
      input.fxRateToBase === undefined
        ? existing.fxRateToBase === null
          ? null
          : existing.fxRateToBase.toString()
        : input.fxRateToBase;

    const baseAmountPyg = this.validateAndComputeBaseAmountPyg({
      currency: effectiveCurrency,
      amount: effectiveAmount,
      fxRateToBase: effectiveFxRateToBase,
    });

    const effectiveOccurredAt =
      input.occurredAt !== undefined ? new Date(input.occurredAt) : existing.occurredAt;
    const timezone = await this.getHouseholdTimezone(access);
    const localDate = deriveLocalDate(effectiveOccurredAt, timezone);

    const changes: UpdateTransactionRecordChanges = {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.paymentSourceId !== undefined ? { paymentSourceId: input.paymentSourceId } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
      // Always recomputed from the merged effective state (see the field comment on
      // `UpdateTransactionRecordChanges`), so they stay correct even when the request only
      // touched one of the fields they derive from.
      fxRateToBase:
        effectiveFxRateToBase === null ? null : new Prisma.Decimal(effectiveFxRateToBase),
      baseAmountPyg,
      ...(input.occurredAt !== undefined ? { occurredAt: effectiveOccurredAt } : {}),
      localDate: parseLocalDate(localDate),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedBy: access.actorId,
    };

    let updated: TransactionRecord | null;
    try {
      updated = await this.transactionsRepository.update(
        access.householdId,
        transactionId,
        changes,
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }

    if (updated === null) {
      throw new NotFoundException(TRANSACTION_UNAVAILABLE);
    }

    return { transaction: toTransaction(updated) };
  }

  async deleteTransaction(access: HouseholdAccess, transactionId: string): Promise<void> {
    const existing = await this.transactionsRepository.findInHousehold(
      access.householdId,
      transactionId,
    );
    if (existing === null) {
      throw new NotFoundException(TRANSACTION_UNAVAILABLE);
    }

    // Hard delete only: unlike categories/payment sources, transactions have no archive
    // semantics (see the M3 issue's MOV-05 confirmation screen note).
    await this.transactionsRepository.deleteById(access.householdId, transactionId);
  }

  private async assertValidCategory(
    householdId: string,
    categoryId: string,
    type: Transaction['type'],
  ): Promise<void> {
    const category = await this.categoriesRepository.findInHousehold(householdId, categoryId);
    if (category?.kind !== type) {
      throw new BadRequestException(CATEGORY_MUST_MATCH_TYPE);
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

  private async getHouseholdTimezone(access: HouseholdAccess): Promise<string> {
    const household = await this.householdsRepository.findDetail(access);
    if (household === null) {
      throw new NotFoundException(HOUSEHOLD_UNAVAILABLE);
    }
    return household.timezone;
  }

  private validateAndComputeBaseAmountPyg(input: {
    readonly currency: Transaction['currency'];
    readonly amount: string;
    readonly fxRateToBase: string | null;
  }): Prisma.Decimal {
    try {
      assertAmountCurrencyConsistency(input);
      return computeBaseAmountPyg(input);
    } catch (error) {
      if (
        error instanceof AmountCurrencyScaleError ||
        error instanceof FxRateRequirementError ||
        error instanceof BaseAmountPygOverflowError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

function mapPersistenceError(error: unknown): unknown {
  if (error instanceof TransactionCategoryInvalidError) {
    return new BadRequestException(CATEGORY_MUST_MATCH_TYPE);
  }
  if (error instanceof TransactionPaymentSourceInvalidError) {
    return new BadRequestException(PAYMENT_SOURCE_MUST_BELONG_TO_HOUSEHOLD);
  }
  return error;
}

function toTransaction(record: TransactionRecord): Transaction {
  return {
    id: record.id,
    householdId: record.householdId,
    type: record.type,
    amount: record.amount.toFixed(record.currency === 'PYG' ? 0 : 2),
    currency: record.currency,
    fxRateToBase: record.fxRateToBase === null ? null : record.fxRateToBase.toString(),
    baseAmountPyg: record.baseAmountPyg.toFixed(0),
    occurredAt: record.occurredAt.toISOString(),
    localDate: formatLocalDate(record.localDate),
    categoryId: record.categoryId,
    paymentSourceId: record.paymentSourceId,
    description: record.description,
    notes: record.notes,
    origin: record.origin,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
