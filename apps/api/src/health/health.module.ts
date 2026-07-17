import { Module } from '@nestjs/common';

import { DatabaseHealthService } from '../database/database-health.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { DATABASE_READINESS, HealthController } from './health.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [{ provide: DATABASE_READINESS, useExisting: DatabaseHealthService }],
})
export class HealthModule {}
