import type { HouseholdMemberStatus, HouseholdRole } from '@nido/domain-types';

export interface HouseholdAccess {
  readonly actorId: string;
  readonly householdId: string;
  readonly role: HouseholdRole;
  readonly joinedAt: Date;
}

export interface HouseholdSummaryRecord {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: 'PYG';
  readonly timezone: string;
  readonly role: HouseholdRole;
  readonly joinedAt: Date;
}

export interface HouseholdDetailRecord extends HouseholdSummaryRecord {
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface HouseholdMemberRecord {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: HouseholdRole;
  readonly status: HouseholdMemberStatus;
  readonly joinedAt: Date;
}

export interface HouseholdInviteRecord {
  readonly id: string;
  readonly householdId: string;
  readonly email: string;
  readonly expiresAt: Date;
}

export type AcceptInviteResult =
  | { readonly status: 'accepted'; readonly household: HouseholdSummaryRecord }
  | { readonly status: 'duplicate-membership' }
  | { readonly status: 'invalid' };
