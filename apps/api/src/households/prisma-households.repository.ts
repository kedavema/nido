import { Injectable } from '@nestjs/common';
import {
  HOUSEHOLD_MEMBER_STATUSES,
  HOUSEHOLD_ROLES,
  NIDO_TIME_ZONE,
  type HouseholdMemberStatus,
  type HouseholdRole,
} from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import { INITIAL_CATEGORIES } from '../categories/initial-categories.js';
import type {
  AcceptInviteResult,
  HouseholdAccess,
  HouseholdDetailRecord,
  HouseholdInviteRecord,
  HouseholdMemberRecord,
  HouseholdSummaryRecord,
} from './household.js';
import { HOUSEHOLD_MEMBER_LIMIT } from './household.js';
import type { HouseholdsRepository } from './households.repository.js';

@Injectable()
export class PrismaHouseholdsRepository implements HouseholdsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveForUser(userId: string): Promise<readonly HouseholdSummaryRecord[]> {
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        role: true,
        joinedAt: true,
        household: {
          select: {
            id: true,
            name: true,
            baseCurrency: true,
            timezone: true,
          },
        },
      },
      orderBy: [{ joinedAt: 'asc' }, { householdId: 'asc' }],
    });

    return memberships.map((membership) => ({
      id: membership.household.id,
      name: membership.household.name,
      baseCurrency: toBaseCurrency(membership.household.baseCurrency),
      timezone: membership.household.timezone,
      role: toHouseholdRole(membership.role),
      joinedAt: membership.joinedAt,
    }));
  }

  async createWithOwner(userId: string, name: string): Promise<HouseholdDetailRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const household = await transaction.household.create({
        data: {
          name,
          baseCurrency: 'PYG',
          timezone: NIDO_TIME_ZONE,
          createdByUserId: userId,
        },
      });
      const membership = await transaction.householdMember.create({
        data: {
          householdId: household.id,
          userId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      for (const [rootIndex, category] of INITIAL_CATEGORIES.entries()) {
        const root = await transaction.category.create({
          data: {
            householdId: household.id,
            kind: category.kind,
            name: category.name,
            icon: category.icon,
            color: category.color,
            sortOrder: rootIndex,
          },
          select: { id: true },
        });

        if (category.children.length > 0) {
          await transaction.category.createMany({
            data: category.children.map((name, childIndex) => ({
              householdId: household.id,
              kind: category.kind,
              parentId: root.id,
              name,
              icon: category.icon,
              color: category.color,
              sortOrder: childIndex,
            })),
          });
        }
      }

      return {
        id: household.id,
        name: household.name,
        baseCurrency: toBaseCurrency(household.baseCurrency),
        timezone: household.timezone,
        createdByUserId: household.createdByUserId,
        createdAt: household.createdAt,
        updatedAt: household.updatedAt,
        role: toHouseholdRole(membership.role),
        joinedAt: membership.joinedAt,
      };
    });
  }

  async findActiveAccess(userId: string, householdId: string): Promise<HouseholdAccess | null> {
    const membership = await this.prisma.householdMember.findFirst({
      where: { householdId, userId, status: 'ACTIVE' },
      select: { role: true, joinedAt: true },
    });

    if (membership === null) {
      return null;
    }

    return {
      actorId: userId,
      householdId,
      role: toHouseholdRole(membership.role),
      joinedAt: membership.joinedAt,
    };
  }

  async findDetail(access: HouseholdAccess): Promise<HouseholdDetailRecord | null> {
    const membership = await this.prisma.householdMember.findFirst({
      where: {
        householdId: access.householdId,
        userId: access.actorId,
        status: 'ACTIVE',
      },
      select: {
        role: true,
        joinedAt: true,
        household: true,
      },
    });

    if (membership === null) {
      return null;
    }

    return {
      id: membership.household.id,
      name: membership.household.name,
      baseCurrency: toBaseCurrency(membership.household.baseCurrency),
      timezone: membership.household.timezone,
      createdByUserId: membership.household.createdByUserId,
      createdAt: membership.household.createdAt,
      updatedAt: membership.household.updatedAt,
      role: toHouseholdRole(membership.role),
      joinedAt: membership.joinedAt,
    };
  }

  async listMembers(access: HouseholdAccess): Promise<readonly HouseholdMemberRecord[]> {
    const members = await this.prisma.householdMember.findMany({
      where: {
        householdId: access.householdId,
        household: {
          memberships: {
            some: {
              userId: access.actorId,
              status: 'ACTIVE',
            },
          },
        },
      },
      select: {
        userId: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
    });

    return members.map((member) => ({
      userId: member.userId,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      role: toHouseholdRole(member.role),
      status: toHouseholdMemberStatus(member.status),
      joinedAt: member.joinedAt,
    }));
  }

  async createInvite(input: {
    readonly access: HouseholdAccess;
    readonly email: string;
    readonly tokenHash: string;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }): Promise<HouseholdInviteRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const authorizedMembership = await transaction.$queryRaw<readonly { authorized: boolean }[]>`
        SELECT TRUE AS "authorized"
        FROM "household_members"
        WHERE "household_id" = ${input.access.householdId}::uuid
          AND "user_id" = ${input.access.actorId}::uuid
          AND "role" = 'OWNER'
          AND "status" = 'ACTIVE'
        FOR UPDATE
      `;

      if (authorizedMembership.length !== 1) {
        return null;
      }

      const invite = await transaction.householdInvite.create({
        data: {
          householdId: input.access.householdId,
          emailNormalized: input.email,
          tokenHash: input.tokenHash,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
          createdByUserId: input.access.actorId,
        },
      });

      return {
        id: invite.id,
        householdId: invite.householdId,
        email: invite.emailNormalized,
        expiresAt: invite.expiresAt,
      };
    });
  }

  async acceptInvite(input: {
    readonly tokenHash: string;
    readonly userId: string;
    readonly email: string;
    readonly now: Date;
  }): Promise<AcceptInviteResult> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const claim = await transaction.householdInvite.updateMany({
            where: {
              tokenHash: input.tokenHash,
              emailNormalized: input.email,
              usedAt: null,
              expiresAt: { gt: input.now },
            },
            data: { usedAt: input.now },
          });

          if (claim.count !== 1) {
            return { status: 'invalid' } as const;
          }

          const invite = await transaction.householdInvite.findUniqueOrThrow({
            where: { tokenHash: input.tokenHash },
            select: { householdId: true },
          });
          const existingMembership = await transaction.householdMember.findUnique({
            where: {
              householdId_userId: {
                householdId: invite.householdId,
                userId: input.userId,
              },
            },
            select: { userId: true },
          });

          if (existingMembership !== null) {
            throw new DuplicateMembershipTransactionError();
          }

          // Counting inside the transaction is not enough on its own: at read committed, two people
          // holding two distinct invites both read one member and both insert. Serializable makes
          // the database refuse one of them, which is the only place that race is decidable.
          const memberCount = await transaction.householdMember.count({
            where: { householdId: invite.householdId, status: 'ACTIVE' },
          });

          if (memberCount >= HOUSEHOLD_MEMBER_LIMIT) {
            throw new HouseholdFullTransactionError();
          }

          const membership = await transaction.householdMember.create({
            data: {
              householdId: invite.householdId,
              userId: input.userId,
              role: 'MEMBER',
              status: 'ACTIVE',
            },
          });
          const household = await transaction.household.findUniqueOrThrow({
            where: { id: invite.householdId },
          });

          return {
            status: 'accepted',
            household: {
              id: household.id,
              name: household.name,
              baseCurrency: toBaseCurrency(household.baseCurrency),
              timezone: household.timezone,
              role: toHouseholdRole(membership.role),
              joinedAt: membership.joinedAt,
            },
          } as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof HouseholdFullTransactionError || isSerializationFailure(error)) {
        return { status: 'household-full' };
      }

      if (error instanceof DuplicateMembershipTransactionError || isUniqueConstraintError(error)) {
        return { status: 'duplicate-membership' };
      }

      throw error;
    }
  }
}

class DuplicateMembershipTransactionError extends Error {}

/**
 * Thrown to roll the whole transaction back, which also un-claims the invite: a link refused
 * because the household was full has not been spent, so the owner can still use it if a place
 * opens up.
 */
class HouseholdFullTransactionError extends Error {}

/**
 * A serializable transaction that loses the race aborts with a write conflict rather than reaching
 * our own guard. It means exactly what the guard means — someone else took the last slot — so it
 * reports the same conflict instead of surfacing as a server error to the person who lost.
 */
function isSerializationFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2034'
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function toBaseCurrency(value: string): 'PYG' {
  if (value !== 'PYG') {
    throw new Error('Unsupported household base currency');
  }
  return value;
}

function toHouseholdRole(value: string): HouseholdRole {
  if ((HOUSEHOLD_ROLES as readonly string[]).includes(value)) {
    return value as HouseholdRole;
  }
  throw new Error('Unsupported household role');
}

function toHouseholdMemberStatus(value: string): HouseholdMemberStatus {
  if ((HOUSEHOLD_MEMBER_STATUSES as readonly string[]).includes(value)) {
    return value as HouseholdMemberStatus;
  }
  throw new Error('Unsupported household member status');
}
