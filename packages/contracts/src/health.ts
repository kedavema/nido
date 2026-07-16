import { z } from 'zod';

export const HealthLiveResponseSchema = z.strictObject({
  status: z.literal('ok'),
});

export type HealthLiveResponse = z.infer<typeof HealthLiveResponseSchema>;

export const HealthReadyResponseSchema = z.strictObject({
  status: z.literal('ok'),
});

export type HealthReadyResponse = z.infer<typeof HealthReadyResponseSchema>;
