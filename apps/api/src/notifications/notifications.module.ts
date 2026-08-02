import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, SystemClock } from '../common/clock.js';
import type { Environment } from '../config/environment.js';
import { AesGcmCredentialCipher, CREDENTIAL_CIPHER } from './credential-cipher.js';
import { createCredentialKeyring } from './credential-keyring.js';
import { DevicesController } from './devices.controller.js';
import { DEVICES_REPOSITORY } from './devices.repository.js';
import { DevicesService } from './devices.service.js';
import { NOTIFICATION_DELIVERIES_REPOSITORY } from './notification-deliveries.repository.js';
import { NotificationDispatcherService } from './notification-dispatcher.service.js';
import { PrismaDevicesRepository } from './prisma-devices.repository.js';
import { PrismaNotificationDeliveriesRepository } from './prisma-notification-deliveries.repository.js';
import { PUSH_SENDERS } from './push-sender.js';

@Module({
  imports: [AuthModule],
  controllers: [DevicesController],
  providers: [
    DevicesService,
    PrismaDevicesRepository,
    { provide: DEVICES_REPOSITORY, useExisting: PrismaDevicesRepository },
    NotificationDispatcherService,
    PrismaNotificationDeliveriesRepository,
    {
      provide: NOTIFICATION_DELIVERIES_REPOSITORY,
      useExisting: PrismaNotificationDeliveriesRepository,
    },
    {
      // Empty until the Expo and Web Push adapters land in their own slices. Nothing invokes the
      // dispatcher over HTTP yet, so an unreachable channel cannot burn attempts in production.
      provide: PUSH_SENDERS,
      useValue: [],
    },
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
    {
      // Null when the keyring is unconfigured, which disables device registration instead of
      // blocking boot (ADR 0004). A half-configured keyring already failed in environment
      // validation, so reaching here means the configuration is either complete or absent.
      provide: CREDENTIAL_CIPHER,
      useFactory: (config: ConfigService<Environment, true>) => {
        const keyring = createCredentialKeyring({
          NOTIFICATION_CREDENTIAL_KEYS: config.get('NOTIFICATION_CREDENTIAL_KEYS', {
            infer: true,
          }),
          NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID: config.get(
            'NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID',
            { infer: true },
          ),
          NOTIFICATION_CREDENTIAL_PEPPER: config.get('NOTIFICATION_CREDENTIAL_PEPPER', {
            infer: true,
          }),
        });
        return keyring === null ? null : new AesGcmCredentialCipher(keyring);
      },
      inject: [ConfigService],
    },
  ],
})
export class NotificationsModule {}
