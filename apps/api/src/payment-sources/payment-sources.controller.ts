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
  CreatePaymentSourceRequestSchema,
  UpdatePaymentSourceRequestSchema,
  UuidSchema,
  type CreatePaymentSourceRequest,
  type CreatePaymentSourceResponse,
  type ListPaymentSourcesResponse,
  type UpdatePaymentSourceRequest,
  type UpdatePaymentSourceResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { PaymentSourcesService } from './payment-sources.service.js';

@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/payment-sources')
export class PaymentSourcesController {
  constructor(private readonly paymentSources: PaymentSourcesService) {}

  @Get()
  listPaymentSources(
    @CurrentHouseholdAccess() access: HouseholdAccess,
  ): Promise<ListPaymentSourcesResponse> {
    return this.paymentSources.listPaymentSources(access);
  }

  @Post()
  createPaymentSource(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Body(new ZodValidationPipe(CreatePaymentSourceRequestSchema))
    input: CreatePaymentSourceRequest,
  ): Promise<CreatePaymentSourceResponse> {
    return this.paymentSources.createPaymentSource(access, input);
  }

  @Patch(':paymentSourceId')
  updatePaymentSource(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('paymentSourceId', new ZodValidationPipe(UuidSchema)) paymentSourceId: string,
    @Body(new ZodValidationPipe(UpdatePaymentSourceRequestSchema))
    input: UpdatePaymentSourceRequest,
  ): Promise<UpdatePaymentSourceResponse> {
    return this.paymentSources.updatePaymentSource(access, paymentSourceId, input);
  }

  @Delete(':paymentSourceId')
  @HttpCode(204)
  async deletePaymentSource(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('paymentSourceId', new ZodValidationPipe(UuidSchema)) paymentSourceId: string,
  ): Promise<void> {
    await this.paymentSources.deletePaymentSource(access, paymentSourceId);
  }
}
