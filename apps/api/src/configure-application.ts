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
  options: { readonly corsOrigins: readonly string[]; readonly trustedProxyHops?: number },
): void {
  app.disable('x-powered-by');
  if ((options.trustedProxyHops ?? 0) > 0) {
    // Numeric rather than `true`: `true` trusts the whole `X-Forwarded-For` chain, so any caller
    // could prepend an address and hand themselves a fresh rate-limit bucket. A hop count trusts
    // only the proxies we actually put there and reads the client address from the entry just
    // before them. Left unset when the API is reached directly, where the socket address is
    // already the truth and any forwarded header is a forgery.
    app.set('trust proxy', options.trustedProxyHops);
  }
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
