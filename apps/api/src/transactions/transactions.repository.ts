import type {
  CategoryExpenseTotal,
  CreateTransactionRecordInput,
  ListTransactionsFilter,
  MonthlyTotals,
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

/**
 * The composite partial unique index `transactions_created_by_household_id_client_mutation_id_key`
 * (created_by, household_id, client_mutation_id) rejected the insert (ADR 0003): the same actor
 * already claimed this idempotency key for this household. The service catches this to re-fetch
 * the existing row and decide between returning it as a replay or raising a 409 for a
 * hash mismatch.
 */
export class TransactionIdempotencyKeyCollisionError extends Error {}

export interface TransactionsRepository {
  list(householdId: string, filter: ListTransactionsFilter): Promise<readonly TransactionRecord[]>;
  findInHousehold(householdId: string, transactionId: string): Promise<TransactionRecord | null>;
  create(input: CreateTransactionRecordInput): Promise<TransactionRecord>;
  /**
   * Looks up a transaction by the ADR 0003 idempotency tuple `(created_by, household_id,
   * client_mutation_id)`, used to re-fetch and compare hashes after a
   * `TransactionIdempotencyKeyCollisionError`.
   */
  findByClientMutationId(
    createdBy: string,
    householdId: string,
    clientMutationId: string,
  ): Promise<TransactionRecord | null>;
  update(
    householdId: string,
    transactionId: string,
    changes: UpdateTransactionRecordChanges,
  ): Promise<TransactionRecord | null>;
  deleteById(householdId: string, transactionId: string): Promise<boolean>;
  /** Income/expense sums over `local_date` in `[from, to]`, per ADR 0007. */
  getMonthlyTotals(householdId: string, from: string, to: string): Promise<MonthlyTotals>;
  /**
   * Expense sums over `local_date` in `[from, to]`, grouped by each transaction's own
   * `category_id` (leaf or root, unresolved) per ADR 0007. Callers that need root-category
   * totals (e.g. `MonthlySummaryService`) fold these by category hierarchy themselves.
   */
  getExpenseTotalsByCategory(
    householdId: string,
    from: string,
    to: string,
  ): Promise<readonly CategoryExpenseTotal[]>;
  /** Up to `limit` most recent transactions (by `localDate`, then `occurredAt`, then `id`, desc) with `local_date` in `[from, to]`. */
  findRecent(
    householdId: string,
    from: string,
    to: string,
    limit: number,
  ): Promise<readonly TransactionRecord[]>;
}
