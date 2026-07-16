import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApplication } from './configure-application.js';
import type { Environment } from './config/environment.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
const config = app.get<ConfigService<Environment, true>>(ConfigService);

configureApplication(app);

await app.listen(config.get('PORT', { infer: true }));
