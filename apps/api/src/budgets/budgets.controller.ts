import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  CopyBudgetMonthRequestSchema,
  MonthSchema,
  UpsertBudgetMonthRequestSchema,
  type CopyBudgetMonthRequest,
  type CopyBudgetMonthResponse,
  type GetBudgetMonthResponse,
  type UpsertBudgetMonthRequest,
  type UpsertBudgetMonthResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { BudgetsService } from './budgets.service.js';

@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get(':yyyyMm')
  getBudgetMonth(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('yyyyMm', new ZodValidationPipe(MonthSchema)) month: string,
  ): Promise<GetBudgetMonthResponse> {
    return this.budgets.getBudgetMonth(access, month);
  }

  @Put(':yyyyMm')
  upsertBudgetMonth(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('yyyyMm', new ZodValidationPipe(MonthSchema)) month: string,
    @Body(new ZodValidationPipe(UpsertBudgetMonthRequestSchema)) input: UpsertBudgetMonthRequest,
  ): Promise<UpsertBudgetMonthResponse> {
    return this.budgets.upsertBudgetMonth(access, month, input);
  }

  @Post(':yyyyMm/copy')
  copyBudgetMonth(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('yyyyMm', new ZodValidationPipe(MonthSchema)) month: string,
    @Body(new ZodValidationPipe(CopyBudgetMonthRequestSchema)) input: CopyBudgetMonthRequest,
  ): Promise<CopyBudgetMonthResponse> {
    return this.budgets.copyBudgetMonth(access, month, input);
  }
}
