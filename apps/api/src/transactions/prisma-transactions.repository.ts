import { Injectable } from '@nestjs/common';
import {
  SUPPORTED_CURRENCY_CODES,
  TRANSACTION_ORIGINS,
  TRANSACTION_TYPES,
  type SupportedCurrencyCode,
  type TransactionOrigin,
  type TransactionType,
} from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import { parseLocalDate } from './local-date.js';
import type {
  CreateTransactionRecordInput,
  ListTransactionsFilter,
  TransactionRecord,
  UpdateTransactionRecordChanges,
} from './transaction.js';
import {
  TransactionCategoryInvalidError,
  TransactionPaymentSourceInvalidError,
  type TransactionsRepository,
} from './transactions.repository.js';

const CATEGORY_FOREIGN_KEY = 'transactions_category_id_fkey';
const PAYMENT_SOURCE_FOREIGN_KEY = 'transactions_payment_source_id_fkey';
const FOREIGN_KEY_VIOLATION_CODE = '23503';
const CHECK_VIOLATION_CODE = '23514';
// The pg driver adapter surfaces trigger RAISE errors with the SQLSTATE and the message text
// only (no constraint name in some code paths), so match the migration's messages too.
const CATEGORY_TRIGGER_CONSTRAINTS = [
  'transactions_category_same_household_check',
  'transactions_category_kind_matches_type_check',
] as const;
const CATEGORY_TRIGGER_MESSAGE_FRAGMENTS = [
  'category must belong to the same household',
  'category kind must match',
] as const;
const PAYMENT_SOURCE_TRIGGER_CONSTRAINTS = [
  'transactions_payment_source_same_household_check',
] as const;
const PAYMENT_SOURCE_TRIGGER_MESSAGE_FRAGMENTS = [
  'payment source must belong to the same household',
] as const;

@Injectable()
export class PrismaTransactionsRepository implements TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    householdId: string,
    filter: ListTransactionsFilter,
  ): Promise<readonly TransactionRecord[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        householdId,
        ...(filter.from !== undefined || filter.to !== undefined
          ? {
              localDate: {
                ...(filter.from !== undefined ? { gte: parseLocalDate(filter.from) } : {}),
                ...(filter.to !== undefined ? { lte: parseLocalDate(filter.to) } : {}),
              },
            }
          : {}),
        ...(filter.type !== undefined ? { type: filter.type } : {}),
        ...(filter.categoryId !== undefined ? { categoryId: filter.categoryId } : {}),
        ...(filter.paymentSourceId !== undefined
          ? { paymentSourceId: filter.paymentSourceId }
          : {}),
        ...(filter.createdBy !== undefined ? { createdBy: filter.createdBy } : {}),
        ...(filter.currency !== undefined ? { currency: filter.currency } : {}),
        // Free-text search matches description or notes, case-insensitively (ILIKE via
        // Prisma's `insensitive` string filter mode). Notes is included because it is a
        // free-form field the user writes on the same movement; description alone would miss
        // matches the user can clearly recall entering.
        ...(filter.search !== undefined
          ? {
              OR: [
                { description: { contains: filter.search, mode: 'insensitive' as const } },
                { notes: { contains: filter.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ localDate: 'desc' }, { occurredAt: 'desc' }, { id: 'desc' }],
    });
    return transactions.map(toTransactionRecord);
  }

  async findInHousehold(
    householdId: string,
    transactionId: string,
  ): Promise<TransactionRecord | null> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, householdId },
    });
    return transaction === null ? null : toTransactionRecord(transaction);
  }

  async create(input: CreateTransactionRecordInput): Promise<TransactionRecord> {
    try {
      const transaction = await this.prisma.transaction.create({
        data: {
          householdId: input.householdId,
          type: input.type,
          amount: input.amount,
          currency: input.currency,
          fxRateToBase: input.fxRateToBase,
          baseAmountPyg: input.baseAmountPyg,
          occurredAt: input.occurredAt,
          localDate: input.localDate,
          categoryId: input.categoryId,
          paymentSourceId: input.paymentSourceId,
          description: input.description,
          notes: input.notes,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        },
      });
      return toTransactionRecord(transaction);
    } catch (error) {
      throw translateWriteError(error);
    }
  }

  async update(
    householdId: string,
    transactionId: string,
    changes: UpdateTransactionRecordChanges,
  ): Promise<TransactionRecord | null> {
    try {
      const transaction = await this.prisma.transaction.update({
        where: { id: transactionId, householdId },
        data: changes,
      });
      return toTransactionRecord(transaction);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      throw translateWriteError(error);
    }
  }

  async deleteById(householdId: string, transactionId: string): Promise<boolean> {
    try {
      await this.prisma.transaction.delete({ where: { id: transactionId, householdId } });
      return true;
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }
}

function toTransactionRecord(transaction: {
  readonly id: string;
  readonly householdId: string;
  readonly type: string;
  readonly amount: TransactionRecord['amount'];
  readonly currency: string;
  readonly fxRateToBase: TransactionRecord['fxRateToBase'];
  readonly baseAmountPyg: TransactionRecord['baseAmountPyg'];
  readonly occurredAt: Date;
  readonly localDate: Date;
  readonly categoryId: string;
  readonly paymentSourceId: string | null;
  readonly description: string;
  readonly notes: string | null;
  readonly origin: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): TransactionRecord {
  return {
    id: transaction.id,
    householdId: transaction.householdId,
    type: toTransactionType(transaction.type),
    amount: transaction.amount,
    currency: toTransactionCurrency(transaction.currency),
    fxRateToBase: transaction.fxRateToBase,
    baseAmountPyg: transaction.baseAmountPyg,
    occurredAt: transaction.occurredAt,
    localDate: transaction.localDate,
    categoryId: transaction.categoryId,
    paymentSourceId: transaction.paymentSourceId,
    description: transaction.description,
    notes: transaction.notes,
    origin: toTransactionOrigin(transaction.origin),
    createdBy: transaction.createdBy,
    updatedBy: transaction.updatedBy,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

function toTransactionType(value: string): TransactionType {
  if ((TRANSACTION_TYPES as readonly string[]).includes(value)) {
    return value as TransactionType;
  }
  throw new Error('Unsupported transaction type');
}

function toTransactionCurrency(value: string): SupportedCurrencyCode {
  if ((SUPPORTED_CURRENCY_CODES as readonly string[]).includes(value)) {
    return value as SupportedCurrencyCode;
  }
  throw new Error('Unsupported transaction currency');
}

function toTransactionOrigin(value: string): TransactionOrigin {
  if ((TRANSACTION_ORIGINS as readonly string[]).includes(value)) {
    return value as TransactionOrigin;
  }
  throw new Error('Unsupported transaction origin');
}

/**
 * Maps database-level failures to domain errors as a backstop for races that slip past the
 * service pre-checks. The trigger enforces category/payment-source household and kind
 * consistency (see the M3 migration), so a concurrent writer can still surface them here.
 */
function translateWriteError(error: unknown): unknown {
  const text = collectErrorText(error);

  if (
    CATEGORY_TRIGGER_CONSTRAINTS.some((constraint) => text.includes(constraint)) ||
    (hasPostgresCode(error, CHECK_VIOLATION_CODE) &&
      CATEGORY_TRIGGER_MESSAGE_FRAGMENTS.some((fragment) => text.includes(fragment))) ||
    isForeignKeyErrorFor(error, text, CATEGORY_FOREIGN_KEY)
  ) {
    return new TransactionCategoryInvalidError(
      'Transaction category must belong to the household and match the transaction type',
    );
  }

  if (
    PAYMENT_SOURCE_TRIGGER_CONSTRAINTS.some((constraint) => text.includes(constraint)) ||
    (hasPostgresCode(error, CHECK_VIOLATION_CODE) &&
      PAYMENT_SOURCE_TRIGGER_MESSAGE_FRAGMENTS.some((fragment) => text.includes(fragment))) ||
    isForeignKeyErrorFor(error, text, PAYMENT_SOURCE_FOREIGN_KEY)
  ) {
    return new TransactionPaymentSourceInvalidError(
      'Transaction payment source must belong to the household',
    );
  }

  return error;
}

function isRecordNotFoundError(error: unknown): boolean {
  return errorCode(error) === 'P2025';
}

function isForeignKeyErrorFor(error: unknown, text: string, foreignKeyName: string): boolean {
  return (
    (errorCode(error) === 'P2003' || hasPostgresCode(error, FOREIGN_KEY_VIOLATION_CODE)) &&
    text.includes(foreignKeyName)
  );
}

function hasPostgresCode(error: unknown, sqlState: string, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return false;
  }
  if ('code' in error && error.code === sqlState) {
    return true;
  }
  if ('originalCode' in error && error.originalCode === sqlState) {
    return true;
  }
  return 'cause' in error && hasPostgresCode(error.cause, sqlState, depth + 1);
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function collectErrorText(error: unknown, depth = 0): string {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return '';
  }

  const parts: string[] = [];
  if ('message' in error && typeof error.message === 'string') {
    parts.push(error.message);
  }
  if ('originalMessage' in error && typeof error.originalMessage === 'string') {
    parts.push(error.originalMessage);
  }
  if ('meta' in error) {
    try {
      parts.push(JSON.stringify(error.meta));
    } catch {
      // Ignore non-serializable metadata.
    }
  }
  if ('cause' in error) {
    parts.push(collectErrorText(error.cause, depth + 1));
  }
  return parts.join(' ');
}
