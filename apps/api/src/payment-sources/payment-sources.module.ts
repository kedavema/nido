import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { PaymentSourcesController } from './payment-sources.controller.js';
import { PAYMENT_SOURCES_REPOSITORY } from './payment-sources.repository.js';
import { PaymentSourcesService } from './payment-sources.service.js';
import { PrismaPaymentSourcesRepository } from './prisma-payment-sources.repository.js';

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [PaymentSourcesController],
  providers: [
    PaymentSourcesService,
    PrismaPaymentSourcesRepository,
    { provide: PAYMENT_SOURCES_REPOSITORY, useExisting: PrismaPaymentSourcesRepository },
  ],
})
export class PaymentSourcesModule {}
