import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, SystemClock } from '../common/clock.js';
import { HouseholdsModule } from '../households/households.module.js';
import { OccurrencesController } from './occurrences.controller.js';
import { OccurrencesService } from './occurrences.service.js';
import { OCCURRENCE_SETTLEMENT_REPOSITORY } from './occurrence-settlement.repository.js';
import { OCCURRENCE_SWEEP_REPOSITORY } from './occurrence-sweep.repository.js';
import { OCCURRENCES_REPOSITORY } from './occurrences.repository.js';
import { PrismaOccurrenceSettlementRepository } from './prisma-occurrence-settlement.repository.js';
import { PrismaOccurrenceSweepRepository } from './prisma-occurrence-sweep.repository.js';
import { PrismaOccurrencesRepository } from './prisma-occurrences.repository.js';

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [OccurrencesController],
  providers: [
    OccurrencesService,
    PrismaOccurrencesRepository,
    { provide: OCCURRENCES_REPOSITORY, useExisting: PrismaOccurrencesRepository },
    PrismaOccurrenceSweepRepository,
    { provide: OCCURRENCE_SWEEP_REPOSITORY, useExisting: PrismaOccurrenceSweepRepository },
    PrismaOccurrenceSettlementRepository,
    {
      provide: OCCURRENCE_SETTLEMENT_REPOSITORY,
      useExisting: PrismaOccurrenceSettlementRepository,
    },
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
  ],
})
export class OccurrencesModule {}
