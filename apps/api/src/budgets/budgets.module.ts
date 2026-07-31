import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { BudgetsController } from './budgets.controller.js';
import { BUDGETS_REPOSITORY } from './budgets.repository.js';
import { BudgetsService } from './budgets.service.js';
import { PrismaBudgetsRepository } from './prisma-budgets.repository.js';

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [BudgetsController],
  providers: [
    BudgetsService,
    PrismaBudgetsRepository,
    { provide: BUDGETS_REPOSITORY, useExisting: PrismaBudgetsRepository },
  ],
})
export class BudgetsModule {}
