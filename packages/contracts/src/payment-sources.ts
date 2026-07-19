import { PAYMENT_SOURCE_TYPES } from '@nido/domain-types';
import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './identity.js';

export const PaymentSourceTypeSchema = z.enum(PAYMENT_SOURCE_TYPES);

export const PaymentSourceNameSchema = z.string().trim().min(1).max(100);

export const PaymentSourceSchema = z.strictObject({
  id: UuidSchema,
  householdId: UuidSchema,
  name: PaymentSourceNameSchema,
  type: PaymentSourceTypeSchema,
  ownerUserId: UuidSchema.nullable(),
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CreatePaymentSourceRequestSchema = z.strictObject({
  name: PaymentSourceNameSchema,
  type: PaymentSourceTypeSchema,
  ownerUserId: UuidSchema.optional(),
});

export const UpdatePaymentSourceRequestSchema = z.strictObject({
  name: PaymentSourceNameSchema.optional(),
  type: PaymentSourceTypeSchema.optional(),
  ownerUserId: UuidSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const CreatePaymentSourceResponseSchema = z.strictObject({
  paymentSource: PaymentSourceSchema,
});

export const UpdatePaymentSourceResponseSchema = CreatePaymentSourceResponseSchema;

export const ListPaymentSourcesResponseSchema = z.strictObject({
  paymentSources: z.array(PaymentSourceSchema),
});

export type PaymentSourceType = z.infer<typeof PaymentSourceTypeSchema>;
export type PaymentSource = z.infer<typeof PaymentSourceSchema>;
export type CreatePaymentSourceRequest = z.infer<typeof CreatePaymentSourceRequestSchema>;
export type UpdatePaymentSourceRequest = z.infer<typeof UpdatePaymentSourceRequestSchema>;
export type CreatePaymentSourceResponse = z.infer<typeof CreatePaymentSourceResponseSchema>;
export type UpdatePaymentSourceResponse = z.infer<typeof UpdatePaymentSourceResponseSchema>;
export type ListPaymentSourcesResponse = z.infer<typeof ListPaymentSourcesResponseSchema>;
