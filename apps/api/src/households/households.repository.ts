import type {
  AcceptInviteResult,
  HouseholdAccess,
  HouseholdDetailRecord,
  HouseholdInviteRecord,
  HouseholdMemberRecord,
  HouseholdSummaryRecord,
} from './household.js';

export const HOUSEHOLDS_REPOSITORY = Symbol('HOUSEHOLDS_REPOSITORY');

export interface HouseholdsRepository {
  listActiveForUser(userId: string): Promise<readonly HouseholdSummaryRecord[]>;
  createWithOwner(userId: string, name: string): Promise<HouseholdDetailRecord>;
  findActiveAccess(userId: string, householdId: string): Promise<HouseholdAccess | null>;
  findDetail(access: HouseholdAccess): Promise<HouseholdDetailRecord | null>;
  listMembers(access: HouseholdAccess): Promise<readonly HouseholdMemberRecord[]>;
  createInvite(input: {
    readonly access: HouseholdAccess;
    readonly email: string;
    readonly tokenHash: string;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }): Promise<HouseholdInviteRecord | null>;
  acceptInvite(input: {
    readonly tokenHash: string;
    readonly userId: string;
    readonly email: string;
    readonly now: Date;
  }): Promise<AcceptInviteResult>;
}
