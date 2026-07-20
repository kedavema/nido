import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  MonthlySummaryQuerySchema,
  type MonthlySummaryQuery,
  type MonthlySummaryResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { MonthlySummaryService } from './monthly-summary.service.js';

// Dedicated `reports` sub-path (docs/system-design.md §12), distinct from the `transactions`
// resource controller: `reports/monthly-summary` is a read-only aggregate view, not a movement,
// and M6 adds sibling routes (`reports/category-breakdown`, `reports/trends`) under the same
// prefix — see ADR 0007's "Consecuencias".
@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/reports')
export class ReportsController {
  constructor(private readonly monthlySummary: MonthlySummaryService) {}

  @Get('monthly-summary')
  getMonthlySummary(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Query(new ZodValidationPipe(MonthlySummaryQuerySchema)) query: MonthlySummaryQuery,
  ): Promise<MonthlySummaryResponse> {
    return this.monthlySummary.getMonthlySummary(access, query);
  }
}
