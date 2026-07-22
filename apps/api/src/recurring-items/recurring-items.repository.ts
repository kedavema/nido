import type {
  CreateRecurringItemRecordInput,
  GeneratedOccurrenceInput,
  RecurringItemRecord,
  UpdateRecurringItemRecordChanges,
} from './recurring-item.js';

export const RECURRING_ITEMS_REPOSITORY = Symbol('RECURRING_ITEMS_REPOSITORY');

export interface RecurringItemsRepository {
  list(householdId: string): Promise<readonly RecurringItemRecord[]>;
  findInHousehold(
    householdId: string,
    recurringItemId: string,
  ): Promise<RecurringItemRecord | null>;
  /**
   * Inserts the rule and its full generated occurrence schedule atomically in one transaction
   * (ADR 0009 point 1: alta de una regla genera todas las ocurrencias `PENDING` del horizonte).
   * The occurrence insert uses `skipDuplicates` against the `(recurring_item_id, due_date)`
   * unique constraint, so re-running generation for the same rule never throws or duplicates.
   */
  createWithOccurrences(
    input: CreateRecurringItemRecordInput,
    occurrences: readonly GeneratedOccurrenceInput[],
  ): Promise<RecurringItemRecord>;
  /**
   * Applies `changes` to the rule and, in the same transaction, replaces only the occurrences
   * that are still `PENDING` and due on or after `regeneration.today` with
   * `regeneration.occurrences` (ADR 0009 point 2: editar una regla activa regenera solo las
   * ocurrencias `PENDING` futuras dentro del horizonte). `SETTLED`, `SKIPPED`, `OVERDUE`, and
   * any past-due `PENDING` occurrence are never deleted or modified. The insert of the
   * replacement occurrences uses `skipDuplicates`, so a due date shared with an untouched
   * non-`PENDING` occurrence is silently skipped instead of colliding.
   *
   * `regeneration` is `null` when the rule is (or is becoming) inactive: per ADR 0009,
   * deactivating a rule "no borra ni cambia ocurrencias ya generadas", so this call must update
   * only the rule row and leave every occurrence — including future `PENDING` ones — untouched.
   */
  updateWithFutureOccurrences(
    householdId: string,
    recurringItemId: string,
    changes: UpdateRecurringItemRecordChanges,
    regeneration: {
      readonly today: Date;
      readonly occurrences: readonly GeneratedOccurrenceInput[];
    } | null,
  ): Promise<RecurringItemRecord | null>;
  /**
   * Sets `is_active = false` (ADR 0009: "Desactivar una regla detiene la generación futura pero
   * no borra ni cambia ocurrencias ya generadas"). Never touches the `occurrences` table.
   */
  deactivate(householdId: string, recurringItemId: string): Promise<RecurringItemRecord | null>;
}
