import { Injectable } from '@nestjs/common';
import type { DispatchNotificationsResponse } from '@nido/contracts';

import { NotificationDispatcherService } from './notification-dispatcher.service.js';

/**
 * Rows claimed by an app-open dispatch. Small on purpose: this call is fired from the client
 * without awaiting it, so a big batch would only lengthen a request nobody is reading.
 */
export const APP_DISPATCH_BATCH_LIMIT = 20;

/** Rows claimed by the scheduler, which sweeps every household and has no user waiting on it. */
export const JOB_DISPATCH_BATCH_LIMIT = 200;

const ALL_HOUSEHOLDS = '*';

const NOTHING_DISPATCHED = { claimed: 0, sent: 0, failed: 0 } as const;

/**
 * Serializes dispatch runs so a second concurrent call returns immediately instead of queueing
 * behind the first (ADR 0012).
 *
 * ADR 0012 describes this as `pg_try_advisory_lock`, and that is not what this is — deliberately.
 * A session-scoped Postgres lock has to be taken and released on the same connection, but Prisma
 * hands out pooled connections per query, so the unlock could land on a different one and leak the
 * lock until the instance restarts. Wrapping the dispatch in one interactive transaction would pin
 * a connection, but it would also hold that transaction open across every push HTTP call and make
 * the claims roll back on failure — which directly contradicts the ADR's other rule, that an
 * attempt is spent at claim time and survives a crash.
 *
 * What actually guarantees two runs never claim the same row is the `FOR UPDATE SKIP LOCKED` in
 * the claim query, and that holds across processes regardless of this guard. This set is only the
 * "return immediately" behaviour the `skipped` flag reports, and an in-process set delivers it
 * exactly on the single free instance the deployment runs on (ADR 0004).
 */
@Injectable()
export class NotificationDispatchService {
  private readonly inFlight = new Set<string>();

  constructor(private readonly dispatcher: NotificationDispatcherService) {}

  /** Triggered by the client after login or app open, without awaiting the response. */
  dispatchHousehold(householdId: string): Promise<DispatchNotificationsResponse> {
    return this.run(householdId, { householdId, limit: APP_DISPATCH_BATCH_LIMIT });
  }

  /** Triggered by the scheduler, across every household at once. */
  dispatchAll(): Promise<DispatchNotificationsResponse> {
    return this.run(ALL_HOUSEHOLDS, { limit: JOB_DISPATCH_BATCH_LIMIT });
  }

  private async run(
    key: string,
    options: { householdId?: string; limit: number },
  ): Promise<DispatchNotificationsResponse> {
    if (this.inFlight.has(key)) {
      return { ...NOTHING_DISPATCHED, skipped: true };
    }

    this.inFlight.add(key);
    try {
      const summary = await this.dispatcher.dispatch(options);
      return { ...summary, skipped: false };
    } finally {
      // `finally` rather than after the await: a thrown dispatch must not leave the key held, or
      // every later call for that household would report `skipped` forever.
      this.inFlight.delete(key);
    }
  }
}
