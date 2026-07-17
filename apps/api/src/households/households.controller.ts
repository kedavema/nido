import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CreateHouseholdInviteRequestSchema,
  CreateHouseholdRequestSchema,
  InviteTokenSchema,
  type AcceptHouseholdInviteResponse,
  type CreateHouseholdInviteRequest,
  type CreateHouseholdInviteResponse,
  type CreateHouseholdRequest,
  type CreateHouseholdResponse,
  type GetHouseholdMembersResponse,
  type GetHouseholdResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { LocalUser } from '../users/user.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from './current-household-access.decorator.js';
import type { HouseholdAccess } from './household.js';
import { HouseholdMembershipGuard } from './household-membership.guard.js';
import { HouseholdsService } from './households.service.js';
import { RequireHouseholdRoles } from './required-household-roles.decorator.js';

@UseGuards(AuthenticationGuard)
@Controller()
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Post('households')
  createHousehold(
    @CurrentUser() user: LocalUser,
    @Body(new ZodValidationPipe(CreateHouseholdRequestSchema)) input: CreateHouseholdRequest,
  ): Promise<CreateHouseholdResponse> {
    return this.households.createHousehold(user.id, input.name);
  }

  @Get('households/:householdId')
  @UseGuards(HouseholdMembershipGuard)
  @RequireHouseholdRoles('OWNER', 'MEMBER')
  getHousehold(@CurrentHouseholdAccess() access: HouseholdAccess): Promise<GetHouseholdResponse> {
    return this.households.getHousehold(access);
  }

  @Get('households/:householdId/members')
  @UseGuards(HouseholdMembershipGuard)
  @RequireHouseholdRoles('OWNER', 'MEMBER')
  getMembers(
    @CurrentHouseholdAccess() access: HouseholdAccess,
  ): Promise<GetHouseholdMembersResponse> {
    return this.households.getMembers(access);
  }

  @Post('households/:householdId/invites')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(HouseholdMembershipGuard)
  @RequireHouseholdRoles('OWNER')
  createInvite(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Body(new ZodValidationPipe(CreateHouseholdInviteRequestSchema))
    input: CreateHouseholdInviteRequest,
  ): Promise<CreateHouseholdInviteResponse> {
    return this.households.createInvite(access, input.email);
  }

  @Post('invites/:token/accept')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  acceptInvite(
    @CurrentUser() user: LocalUser,
    @Param('token', new ZodValidationPipe(InviteTokenSchema)) token: string,
  ): Promise<AcceptHouseholdInviteResponse> {
    return this.households.acceptInvite(user, token);
  }
}
