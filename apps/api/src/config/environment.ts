import { z } from 'zod';

export const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL must use the postgres or postgresql protocol',
    ),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(values: Record<string, unknown>): Environment {
  return EnvironmentSchema.parse(values);
}
