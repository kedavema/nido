import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { CategoriesController } from './categories.controller.js';
import { CATEGORIES_REPOSITORY } from './categories.repository.js';
import { CategoriesService } from './categories.service.js';
import { PrismaCategoriesRepository } from './prisma-categories.repository.js';

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    PrismaCategoriesRepository,
    { provide: CATEGORIES_REPOSITORY, useExisting: PrismaCategoriesRepository },
  ],
  // Exported so TransactionsModule can pre-check that a transaction's category belongs to the
  // household and matches the transaction kind (mirrors how PaymentSourcesModule reuses
  // HouseholdsModule's HOUSEHOLDS_REPOSITORY for its owner pre-check).
  exports: [CATEGORIES_REPOSITORY],
})
export class CategoriesModule {}
