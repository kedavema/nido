import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CreateHouseholdInviteRequestSchema,
  CreateHouseholdRequestSchema,
  GetMeResponseSchema,
  InviteTokenSchema,
  type CreateHouseholdInviteRequest,
  type CreateHouseholdRequest,
} from '../src/index.js';

describe('M1 household contracts', () => {
  it('normalizes invite emails at the boundary', () => {
    expect(CreateHouseholdInviteRequestSchema.parse({ email: '  Ale@Example.COM ' })).toEqual({
      email: 'ale@example.com',
    });
    expectTypeOf<CreateHouseholdInviteRequest>().toEqualTypeOf<{ email: string }>();
  });

  it('trims household names and rejects extra fields', () => {
    expect(CreateHouseholdRequestSchema.parse({ name: '  Casa ' })).toEqual({ name: 'Casa' });
    expect(CreateHouseholdRequestSchema.safeParse({ name: 'Casa', role: 'OWNER' }).success).toBe(
      false,
    );
    expectTypeOf<CreateHouseholdRequest>().toEqualTypeOf<{ name: string }>();
  });

  it('accepts only a 32-byte base64url invitation token', () => {
    expect(InviteTokenSchema.safeParse('a'.repeat(43)).success).toBe(true);
    expect(InviteTokenSchema.safeParse('a'.repeat(42)).success).toBe(false);
    expect(InviteTokenSchema.safeParse(`${'a'.repeat(42)}=`).success).toBe(false);
  });

  it('keeps /me responses strict', () => {
    const response = {
      user: {
        id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
        email: 'ale@example.com',
        displayName: 'Ale',
        avatarUrl: null,
        timezone: 'America/Asuncion',
        createdAt: '2026-07-16T12:00:00.000Z',
        updatedAt: '2026-07-16T12:00:00.000Z',
      },
      households: [],
    };

    expect(GetMeResponseSchema.parse(response)).toEqual(response);
    expect(GetMeResponseSchema.safeParse({ ...response, firebaseUid: 'secret' }).success).toBe(
      false,
    );
  });
});
