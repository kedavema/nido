import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { DispatchNotificationsResponse } from '@nido/contracts';

import { InternalJobHmacGuard } from './internal-job-hmac.guard.js';
import { NotificationDispatchService } from './notification-dispatch.service.js';

/**
 * The scheduler's entry point (ADR 0012, docs/system-design.md §12). No `AuthenticationGuard`:
 * the caller is a GitHub Actions cron, not a person, and giving a scheduler a user identity would
 * mean minting a credential nobody can rotate on its own. It authenticates with an HMAC over the
 * raw body plus a timestamp and a single-use nonce instead.
 *
 * No household id in the path either — the job sweeps every household in one claim, which is why
 * it shares the dispatcher and the batch guard with the app-open endpoint rather than reaching
 * into the repository itself.
 */
@UseGuards(InternalJobHmacGuard)
@Controller('internal/jobs')
export class InternalJobsController {
  constructor(private readonly dispatch: NotificationDispatchService) {}

  @Post('due-notifications')
  @HttpCode(200)
  dispatchDueNotifications(): Promise<DispatchNotificationsResponse> {
    // Aggregate counters only. The response is written to a public Actions log, so it must never
    // carry occurrence ids, amounts or anything a provider returned (docs/system-design.md §13).
    return this.dispatch.dispatchAll();
  }
}
