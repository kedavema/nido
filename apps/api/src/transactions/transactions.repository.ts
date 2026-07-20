import type {
  CreateTransactionRecordInput,
  ListTransactionsFilter,
  TransactionRecord,
  UpdateTransactionRecordChanges,
} from './transaction.js';

export const TRANSACTIONS_REPOSITORY = Symbol('TRANSACTIONS_REPOSITORY');

/**
 * The category/payment-source consistency trigger rejected the write as a backstop for a race
 * lost to a concurrent change (household re-home, kind change, or the row vanishing between
 * the service pre-check and the write). The service pre-checks both, so in practice this is
 * only reachable under concurrency.
 */
export class TransactionCategoryInvalidError extends Error {}
export class TransactionPaymentSourceInvalidError extends Error {}

export interface TransactionsRepository {
  list(householdId: string, filter: ListTransactionsFilter): Promise<readonly TransactionRecord[]>;
  findInHousehold(householdId: string, transactionId: string): Promise<TransactionRecord | null>;
  create(input: CreateTransactionRecordInput): Promise<TransactionRecord>;
  update(
    householdId: string,
    transactionId: string,
    changes: UpdateTransactionRecordChanges,
  ): Promise<TransactionRecord | null>;
  deleteById(householdId: string, transactionId: string): Promise<boolean>;
}
