import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApplication } from './configure-application.js';
import type { Environment } from './config/environment.js';

// rawBody keeps the exact bytes of each request available, which the internal job's HMAC guard
// needs: signing a parsed-and-reserialized body would let key order or whitespace changes slip
// past the signature.
const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
const config = app.get<ConfigService<Environment, true>>(ConfigService);

configureApplication(app, {
  corsOrigins: config.get('CORS_ORIGINS', { infer: true }),
  trustedProxyHops: config.get('TRUSTED_PROXY_HOPS', { infer: true }),
});

await app.listen(config.get('PORT', { infer: true }));
