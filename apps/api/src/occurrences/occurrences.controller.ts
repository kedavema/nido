import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ListOccurrencesQuerySchema,
  type ListOccurrencesQuery,
  type ListOccurrencesResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { OccurrencesService } from './occurrences.service.js';

@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/occurrences')
export class OccurrencesController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Get()
  listOccurrences(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Query(new ZodValidationPipe(ListOccurrencesQuerySchema)) query: ListOccurrencesQuery,
  ): Promise<ListOccurrencesResponse> {
    return this.occurrences.listOccurrences(access, query);
  }
}
