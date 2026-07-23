import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ListOccurrencesQuerySchema,
  SettleOccurrenceRequestSchema,
  UuidSchema,
  type ListOccurrencesQuery,
  type ListOccurrencesResponse,
  type SettleOccurrenceRequest,
  type SettleOccurrenceResponse,
  type SkipOccurrenceResponse,
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

  @Post(':occurrenceId/settle')
  @HttpCode(200)
  settleOccurrence(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('occurrenceId', new ZodValidationPipe(UuidSchema)) occurrenceId: string,
    @Body(new ZodValidationPipe(SettleOccurrenceRequestSchema)) request: SettleOccurrenceRequest,
  ): Promise<SettleOccurrenceResponse> {
    return this.occurrences.settleOccurrence(access, occurrenceId, request);
  }

  @Post(':occurrenceId/skip')
  @HttpCode(200)
  skipOccurrence(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('occurrenceId', new ZodValidationPipe(UuidSchema)) occurrenceId: string,
  ): Promise<SkipOccurrenceResponse> {
    return this.occurrences.skipOccurrence(access, occurrenceId);
  }
}
