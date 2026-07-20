import { z } from 'zod';

export const UuidSchema = z.uuid();

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const LocalDateSchema = z.iso.date();

export const NormalizedEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const AuthenticatedUserSchema = z.strictObject({
  id: UuidSchema,
  email: NormalizedEmailSchema,
  displayName: z.string().min(1).max(100),
  avatarUrl: z.url().nullable(),
  timezone: z.string().min(1).max(100),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
