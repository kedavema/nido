import { z } from 'zod';

const CorsOriginsSchema = z
  .string()
  .default('http://localhost:8081,http://localhost:19006')
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .pipe(z.array(z.url()).min(1))
  .transform((origins) => [...new Set(origins)]);

export const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z
      .url()
      .refine(
        (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
        'DATABASE_URL must use the postgres or postgresql protocol',
      ),
    FIREBASE_PROJECT_ID: z.string().trim().min(1).max(200),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().trim().min(1).optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().trim().min(1).optional(),
    CORS_ORIGINS: CorsOriginsSchema,
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.FIREBASE_AUTH_EMULATOR_HOST !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['FIREBASE_AUTH_EMULATOR_HOST'],
        message: 'Firebase Auth emulator mode is forbidden in production',
      });
    }
  });

export type Environment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(values: Record<string, unknown>): Environment {
  return EnvironmentSchema.parse(values);
}
