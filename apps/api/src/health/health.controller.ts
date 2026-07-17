import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthLiveResponse, HealthReadyResponse } from '@nido/contracts';

export const DATABASE_READINESS = Symbol('DATABASE_READINESS');

export interface DatabaseReadiness {
  assertReady(): Promise<void>;
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_READINESS)
    private readonly databaseHealth: DatabaseReadiness,
  ) {}

  @Get('live')
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<HealthReadyResponse> {
    try {
      await this.databaseHealth.assertReady();
    } catch {
      throw new ServiceUnavailableException('Service is not ready');
    }

    return { status: 'ok' };
  }
}
