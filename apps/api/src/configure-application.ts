import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Every verb any controller answers, plus OPTIONS for the preflight itself. A verb missing here
 * is not a 405 — the browser refuses to send the request at all and the caller sees an opaque
 * `TypeError`, so the failure looks like a dead host rather than a policy. Native clients skip
 * the preflight entirely, which is how a missing PUT reached production unnoticed. Kept exported
 * so the drift guard in `test/cors-methods.spec.ts` can check it against the controllers.
 */
export const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

export function configureApplication(
  app: NestExpressApplication,
  options: { readonly corsOrigins: readonly string[] },
): void {
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  app.enableCors({
    origin: [...options.corsOrigins],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    methods: [...CORS_ALLOWED_METHODS],
  });
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
}
