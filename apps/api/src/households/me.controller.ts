import { Controller, Get, UseGuards } from '@nestjs/common';
import type { GetMeResponse } from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { LocalUser } from '../users/user.js';
import { HouseholdsService } from './households.service.js';

@UseGuards(AuthenticationGuard)
@Controller('me')
export class MeController {
  constructor(private readonly households: HouseholdsService) {}

  @Get()
  getMe(@CurrentUser() user: LocalUser): Promise<GetMeResponse> {
    return this.households.getMe(user);
  }
}
