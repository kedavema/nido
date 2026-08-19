import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { DispatchNotificationsResponse } from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { NotificationDispatchService } from './notification-dispatch.service.js';

/**
 * The app-open trigger for delivery (ADR 0012). Enqueuing rides inside the occurrences GET, but
 * dispatching is network I/O against an external provider, so it gets its own endpoint rather than
 * hiding a provider's latency and failure modes inside a read.
 *
 * Household-scoped and behind the membership guard because the deliveries it drains carry
 * `household_id` and are therefore financial data under the ADR 0002 boundary — unlike device
 * registration, which is identity-scoped.
 */
@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/notifications')
export class NotificationsDispatchController {
  constructor(private readonly dispatch: NotificationDispatchService) {}

  @Post('dispatch')
  @HttpCode(200)
  dispatchNotifications(
    @CurrentHouseholdAccess() access: HouseholdAccess,
  ): Promise<DispatchNotificationsResponse> {
    // The household id comes from the guard-resolved access, not the raw path parameter, so a
    // member cannot drain another household's deliveries by editing the URL.
    return this.dispatch.dispatchHousehold(access.householdId);
  }
}
