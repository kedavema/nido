import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateRecurringItemRequestSchema,
  UpdateRecurringItemRequestSchema,
  UuidSchema,
  type CreateRecurringItemRequest,
  type CreateRecurringItemResponse,
  type ListRecurringItemsResponse,
  type RecurringItem,
  type UpdateRecurringItemRequest,
  type UpdateRecurringItemResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { RecurringItemsService } from './recurring-items.service.js';

@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/recurring-items')
export class RecurringItemsController {
  constructor(private readonly recurringItems: RecurringItemsService) {}

  @Get()
  listRecurringItems(
    @CurrentHouseholdAccess() access: HouseholdAccess,
  ): Promise<ListRecurringItemsResponse> {
    return this.recurringItems.listRecurringItems(access);
  }

  @Post()
  createRecurringItem(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Body(new ZodValidationPipe(CreateRecurringItemRequestSchema))
    input: CreateRecurringItemRequest,
  ): Promise<CreateRecurringItemResponse> {
    return this.recurringItems.createRecurringItem(access, input);
  }

  @Get(':recurringItemId')
  getRecurringItem(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('recurringItemId', new ZodValidationPipe(UuidSchema)) recurringItemId: string,
  ): Promise<{ recurringItem: RecurringItem }> {
    return this.recurringItems.getRecurringItem(access, recurringItemId);
  }

  @Patch(':recurringItemId')
  updateRecurringItem(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('recurringItemId', new ZodValidationPipe(UuidSchema)) recurringItemId: string,
    @Body(new ZodValidationPipe(UpdateRecurringItemRequestSchema))
    input: UpdateRecurringItemRequest,
  ): Promise<UpdateRecurringItemResponse> {
    return this.recurringItems.updateRecurringItem(access, recurringItemId, input);
  }

  @Delete(':recurringItemId')
  @HttpCode(204)
  async deleteRecurringItem(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('recurringItemId', new ZodValidationPipe(UuidSchema)) recurringItemId: string,
  ): Promise<void> {
    await this.recurringItems.deleteRecurringItem(access, recurringItemId);
  }
}
