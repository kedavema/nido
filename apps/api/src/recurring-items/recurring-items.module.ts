import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CLOCK, SystemClock } from '../common/clock.js';
import { HouseholdsModule } from '../households/households.module.js';
import { PaymentSourcesModule } from '../payment-sources/payment-sources.module.js';
import { PrismaRecurringItemsRepository } from './prisma-recurring-items.repository.js';
import { RecurringItemsController } from './recurring-items.controller.js';
import { RECURRING_ITEMS_REPOSITORY } from './recurring-items.repository.js';
import { RecurringItemsService } from './recurring-items.service.js';

@Module({
  imports: [AuthModule, HouseholdsModule, CategoriesModule, PaymentSourcesModule],
  controllers: [RecurringItemsController],
  providers: [
    RecurringItemsService,
    PrismaRecurringItemsRepository,
    { provide: RECURRING_ITEMS_REPOSITORY, useExisting: PrismaRecurringItemsRepository },
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
  ],
})
export class RecurringItemsModule {}
