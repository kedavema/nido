import { HOUSEHOLD_MEMBER_STATUSES, HOUSEHOLD_ROLES } from '@nido/domain-types';
import { z } from 'zod';

import {
  AuthenticatedUserSchema,
  IsoDateTimeSchema,
  NormalizedEmailSchema,
  UuidSchema,
} from './identity.js';

export const HouseholdRoleSchema = z.enum(HOUSEHOLD_ROLES);
export const HouseholdMemberStatusSchema = z.enum(HOUSEHOLD_MEMBER_STATUSES);

export const HouseholdNameSchema = z.string().trim().min(1).max(100);

export const ActiveHouseholdSummarySchema = z.strictObject({
  id: UuidSchema,
  name: HouseholdNameSchema,
  baseCurrency: z.literal('PYG'),
  timezone: z.string().min(1).max(100),
  role: HouseholdRoleSchema,
  joinedAt: IsoDateTimeSchema,
});

export const GetMeResponseSchema = z.strictObject({
  user: AuthenticatedUserSchema,
  households: z.array(ActiveHouseholdSummarySchema),
});

export const CreateHouseholdRequestSchema = z.strictObject({
  name: HouseholdNameSchema,
});

export const HouseholdDetailSchema = ActiveHouseholdSummarySchema.extend({
  createdByUserId: UuidSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CreateHouseholdResponseSchema = z.strictObject({
  household: HouseholdDetailSchema,
});

export const GetHouseholdResponseSchema = CreateHouseholdResponseSchema;

export const HouseholdMemberSchema = z.strictObject({
  userId: UuidSchema,
  displayName: z.string().min(1).max(100),
  avatarUrl: z.url().nullable(),
  role: HouseholdRoleSchema,
  status: HouseholdMemberStatusSchema,
  joinedAt: IsoDateTimeSchema,
});

export const GetHouseholdMembersResponseSchema = z.strictObject({
  members: z.array(HouseholdMemberSchema),
});

export const CreateHouseholdInviteRequestSchema = z.strictObject({
  email: NormalizedEmailSchema,
});

export const InviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const HouseholdInviteSchema = z.strictObject({
  id: UuidSchema,
  householdId: UuidSchema,
  email: NormalizedEmailSchema,
  expiresAt: IsoDateTimeSchema,
});

export const CreateHouseholdInviteResponseSchema = z.strictObject({
  invite: HouseholdInviteSchema,
  token: InviteTokenSchema,
});

export const AcceptHouseholdInviteResponseSchema = z.strictObject({
  household: ActiveHouseholdSummarySchema,
});

export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;
export type HouseholdMemberStatus = z.infer<typeof HouseholdMemberStatusSchema>;
export type ActiveHouseholdSummary = z.infer<typeof ActiveHouseholdSummarySchema>;
export type GetMeResponse = z.infer<typeof GetMeResponseSchema>;
export type CreateHouseholdRequest = z.infer<typeof CreateHouseholdRequestSchema>;
export type HouseholdDetail = z.infer<typeof HouseholdDetailSchema>;
export type CreateHouseholdResponse = z.infer<typeof CreateHouseholdResponseSchema>;
export type GetHouseholdResponse = z.infer<typeof GetHouseholdResponseSchema>;
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;
export type GetHouseholdMembersResponse = z.infer<typeof GetHouseholdMembersResponseSchema>;
export type CreateHouseholdInviteRequest = z.infer<typeof CreateHouseholdInviteRequestSchema>;
export type HouseholdInvite = z.infer<typeof HouseholdInviteSchema>;
export type CreateHouseholdInviteResponse = z.infer<typeof CreateHouseholdInviteResponseSchema>;
export type AcceptHouseholdInviteResponse = z.infer<typeof AcceptHouseholdInviteResponseSchema>;
