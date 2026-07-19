import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureApplication(
  app: NestExpressApplication,
  options: { readonly corsOrigins: readonly string[] },
): void {
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  app.enableCors({
    origin: [...options.corsOrigins],
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
}
