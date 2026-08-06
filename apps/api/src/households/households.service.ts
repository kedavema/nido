import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AcceptHouseholdInviteResponse,
  CreateHouseholdInviteResponse,
  CreateHouseholdResponse,
  GetHouseholdMembersResponse,
  GetHouseholdResponse,
  GetMeResponse,
} from '@nido/contracts';

import { CLOCK, type Clock } from '../common/clock.js';
import type { LocalUser } from '../users/user.js';
import type {
  HouseholdAccess,
  HouseholdDetailRecord,
  HouseholdMemberRecord,
  HouseholdSummaryRecord,
} from './household.js';
import { HOUSEHOLD_MEMBER_LIMIT } from './household.js';
import { HOUSEHOLDS_REPOSITORY, type HouseholdsRepository } from './households.repository.js';
import { InvitationTokenService } from './invitation-token.service.js';

const INVITATION_LIFETIME_MILLISECONDS = 72 * 60 * 60 * 1000;

@Injectable()
export class HouseholdsService {
  constructor(
    @Inject(HOUSEHOLDS_REPOSITORY)
    private readonly householdsRepository: HouseholdsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly invitationTokens: InvitationTokenService,
  ) {}

  async getMe(user: LocalUser): Promise<GetMeResponse> {
    const households = await this.householdsRepository.listActiveForUser(user.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      households: households.map(toHouseholdSummary),
    };
  }

  async createHousehold(userId: string, name: string): Promise<CreateHouseholdResponse> {
    const household = await this.householdsRepository.createWithOwner(userId, name);
    return { household: toHouseholdDetail(household) };
  }

  async getHousehold(access: HouseholdAccess): Promise<GetHouseholdResponse> {
    const household = await this.householdsRepository.findDetail(access);
    if (household === null) {
      throw new NotFoundException('Household is unavailable');
    }

    return { household: toHouseholdDetail(household) };
  }

  async getMembers(access: HouseholdAccess): Promise<GetHouseholdMembersResponse> {
    const members = await this.householdsRepository.listMembers(access);
    return { members: members.map(toHouseholdMember) };
  }

  async createInvite(
    access: HouseholdAccess,
    email: string,
  ): Promise<CreateHouseholdInviteResponse> {
    // A courtesy, not the boundary: the accept transaction is where the cap is actually decided,
    // because an invite is a URL and this check cannot see who will click it. Failing here just
    // tells the owner before they send a link rather than after their partner taps it.
    const members = await this.householdsRepository.listMembers(access);
    // Counts active members only, matching the real guard: a removed member must not keep
    // occupying a slot once removal exists.
    const activeMembers = members.filter((member) => member.status === 'ACTIVE');
    if (activeMembers.length >= HOUSEHOLD_MEMBER_LIMIT) {
      throw new ConflictException('Household already has the maximum number of members');
    }

    const token = this.invitationTokens.generate();
    const tokenHash = this.invitationTokens.hash(token);
    const createdAt = this.clock.now();
    const expiresAt = new Date(createdAt.getTime() + INVITATION_LIFETIME_MILLISECONDS);
    const invite = await this.householdsRepository.createInvite({
      access,
      email,
      tokenHash,
      createdAt,
      expiresAt,
    });

    if (invite === null) {
      throw new NotFoundException('Household is unavailable');
    }

    return {
      invite: {
        id: invite.id,
        householdId: invite.householdId,
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
      },
      token,
    };
  }

  async acceptInvite(user: LocalUser, token: string): Promise<AcceptHouseholdInviteResponse> {
    const result = await this.householdsRepository.acceptInvite({
      tokenHash: this.invitationTokens.hash(token),
      userId: user.id,
      email: user.email,
      now: this.clock.now(),
    });

    if (result.status === 'invalid') {
      throw new NotFoundException('Invitation is unavailable');
    }

    if (result.status === 'household-full') {
      throw new ConflictException('Household already has the maximum number of members');
    }

    if (result.status === 'duplicate-membership') {
      throw new ConflictException('User is already a household member');
    }

    return { household: toHouseholdSummary(result.household) };
  }
}

function toHouseholdSummary(household: HouseholdSummaryRecord) {
  return {
    id: household.id,
    name: household.name,
    baseCurrency: household.baseCurrency,
    timezone: household.timezone,
    role: household.role,
    joinedAt: household.joinedAt.toISOString(),
  };
}

function toHouseholdDetail(household: HouseholdDetailRecord) {
  return {
    ...toHouseholdSummary(household),
    createdByUserId: household.createdByUserId,
    createdAt: household.createdAt.toISOString(),
    updatedAt: household.updatedAt.toISOString(),
  };
}

function toHouseholdMember(member: HouseholdMemberRecord) {
  return {
    userId: member.userId,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt.toISOString(),
  };
}
