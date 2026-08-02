export const OCCURRENCE_SWEEP_REPOSITORY = Symbol('OCCURRENCE_SWEEP_REPOSITORY');

export interface OccurrenceSweepRepository {
  /**
   * ADR 0009 point 3 (the lazy-on-read sweep): inside one `pg_advisory_xact_lock` transaction
   * scoped by `householdId`, generates every still-missing `PENDING` occurrence for each active
   * recurring item in the household within the 12-month horizon, then marks `OVERDUE` every
   * `PENDING` occurrence whose `dueDate` is before today. `SETTLED` and `SKIPPED` occurrences
   * are never selected by either step, so they can never be touched.
   *
   * M7 (ADR 0012) adds a third step in the same transaction and under the same lock: queueing the
   * notification deliveries due today. It is deliberately not a second daily traversal — reusing
   * this one keeps the "once per household per day" guarantee in a single implementation, and the
   * `last_swept_on` marker keeps covering both the cron and the app-open trigger.
   *
   * Takes the current instant rather than a pre-truncated day because the two steps need
   * different calendars: generation and overdue marking keep using the UTC day they always have,
   * while delivery scheduling is a financial date and must use the household timezone.
   *
   * Safe under concurrency: the advisory lock serializes concurrent calls for the same
   * `householdId` (a second caller waits for the first to commit), and both steps are themselves
   * idempotent (`createMany` with `skipDuplicates` against the `(recurring_item_id, due_date)`
   * unique constraint, and an `UPDATE ... WHERE status = 'PENDING'` that finds nothing left to do
   * once already applied) — so a second concurrent or repeated call for the same household is a
   * safe no-op rather than a duplicate.
   */
  sweep(householdId: string, now: Date): Promise<void>;
}
