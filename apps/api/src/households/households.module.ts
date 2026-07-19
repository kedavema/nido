import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, SystemClock } from '../common/clock.js';
import { HouseholdMembershipGuard } from './household-membership.guard.js';
import { HouseholdsController } from './households.controller.js';
import { HOUSEHOLDS_REPOSITORY } from './households.repository.js';
import { HouseholdsService } from './households.service.js';
import { InvitationTokenService } from './invitation-token.service.js';
import { MeController } from './me.controller.js';
import { PrismaHouseholdsRepository } from './prisma-households.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [MeController, HouseholdsController],
  providers: [
    HouseholdsService,
    HouseholdMembershipGuard,
    InvitationTokenService,
    PrismaHouseholdsRepository,
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
    { provide: HOUSEHOLDS_REPOSITORY, useExisting: PrismaHouseholdsRepository },
  ],
  exports: [HouseholdMembershipGuard, HOUSEHOLDS_REPOSITORY],
})
export class HouseholdsModule {}
