import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateTransactionRequestSchema,
  ListTransactionsQuerySchema,
  UpdateTransactionRequestSchema,
  UuidSchema,
  type CreateTransactionRequest,
  type CreateTransactionResponse,
  type ListTransactionsQuery,
  type ListTransactionsResponse,
  type Transaction,
  type UpdateTransactionRequest,
  type UpdateTransactionResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { TransactionsService } from './transactions.service.js';

@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  listTransactions(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Query(new ZodValidationPipe(ListTransactionsQuerySchema)) query: ListTransactionsQuery,
  ): Promise<ListTransactionsResponse> {
    return this.transactions.listTransactions(access, query);
  }

  @Post()
  createTransaction(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Body(new ZodValidationPipe(CreateTransactionRequestSchema)) input: CreateTransactionRequest,
  ): Promise<CreateTransactionResponse> {
    return this.transactions.createTransaction(access, input);
  }

  @Get(':transactionId')
  getTransaction(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('transactionId', new ZodValidationPipe(UuidSchema)) transactionId: string,
  ): Promise<{ transaction: Transaction }> {
    return this.transactions.getTransaction(access, transactionId);
  }

  @Patch(':transactionId')
  updateTransaction(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('transactionId', new ZodValidationPipe(UuidSchema)) transactionId: string,
    @Body(new ZodValidationPipe(UpdateTransactionRequestSchema)) input: UpdateTransactionRequest,
  ): Promise<UpdateTransactionResponse> {
    return this.transactions.updateTransaction(access, transactionId, input);
  }

  @Delete(':transactionId')
  @HttpCode(204)
  async deleteTransaction(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('transactionId', new ZodValidationPipe(UuidSchema)) transactionId: string,
  ): Promise<void> {
    await this.transactions.deleteTransaction(access, transactionId);
  }
}
