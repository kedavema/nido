import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureApplication(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.enableShutdownHooks();
}
