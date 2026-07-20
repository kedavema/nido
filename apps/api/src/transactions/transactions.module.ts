import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { PaymentSourcesModule } from '../payment-sources/payment-sources.module.js';
import { MonthlySummaryService } from './monthly-summary.service.js';
import { PrismaTransactionsRepository } from './prisma-transactions.repository.js';
import { ReportsController } from './reports.controller.js';
import { TRANSACTIONS_REPOSITORY } from './transactions.repository.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [AuthModule, HouseholdsModule, CategoriesModule, PaymentSourcesModule],
  controllers: [TransactionsController, ReportsController],
  providers: [
    TransactionsService,
    MonthlySummaryService,
    PrismaTransactionsRepository,
    { provide: TRANSACTIONS_REPOSITORY, useExisting: PrismaTransactionsRepository },
  ],
})
export class TransactionsModule {}
