import { Controller, Get } from '@nestjs/common';
import type { HealthLiveResponse, HealthReadyResponse } from '@nido/contracts';

@Controller('health')
export class HealthController {
  @Get('live')
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): HealthReadyResponse {
    return { status: 'ok' };
  }
}
