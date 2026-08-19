import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, SystemClock } from '../common/clock.js';
import { HouseholdsModule } from '../households/households.module.js';
import type { Environment } from '../config/environment.js';
import { AesGcmCredentialCipher, CREDENTIAL_CIPHER } from './credential-cipher.js';
import { createCredentialKeyring } from './credential-keyring.js';
import { DevicesController } from './devices.controller.js';
import { DEVICES_REPOSITORY } from './devices.repository.js';
import { DevicesService } from './devices.service.js';
import { ExpoPushSender } from './expo-push.sender.js';
import { InternalJobHmacGuard } from './internal-job-hmac.guard.js';
import { INTERNAL_JOB_NONCES_REPOSITORY } from './internal-job-nonces.repository.js';
import { InternalJobsController } from './internal-jobs.controller.js';
import { NOTIFICATION_DELIVERIES_REPOSITORY } from './notification-deliveries.repository.js';
import { NotificationDispatchService } from './notification-dispatch.service.js';
import { NotificationDispatcherService } from './notification-dispatcher.service.js';
import { PrismaDevicesRepository } from './prisma-devices.repository.js';
import { PrismaInternalJobNoncesRepository } from './prisma-internal-job-nonces.repository.js';
import { PrismaNotificationDeliveriesRepository } from './prisma-notification-deliveries.repository.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsDispatchController } from './notifications-dispatch.controller.js';
import { PUSH_SENDERS, type PushSender } from './push-sender.js';
import { createVapidKeys, VAPID_KEYS } from './vapid-keys.js';
import { WebPushSender } from './web-push.sender.js';

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [
    DevicesController,
    NotificationsController,
    NotificationsDispatchController,
    InternalJobsController,
  ],
  providers: [
    DevicesService,
    PrismaDevicesRepository,
    { provide: DEVICES_REPOSITORY, useExisting: PrismaDevicesRepository },
    NotificationDispatcherService,
    NotificationDispatchService,
    InternalJobHmacGuard,
    PrismaInternalJobNoncesRepository,
    {
      provide: INTERNAL_JOB_NONCES_REPOSITORY,
      useExisting: PrismaInternalJobNoncesRepository,
    },
    PrismaNotificationDeliveriesRepository,
    {
      provide: NOTIFICATION_DELIVERIES_REPOSITORY,
      useExisting: PrismaNotificationDeliveriesRepository,
    },
    ExpoPushSender,
    WebPushSender,
    {
      // The dispatcher picks a sender by channel, so an installation on a channel with no adapter
      // fails that delivery rather than crashing the run.
      provide: PUSH_SENDERS,
      useFactory: (expo: ExpoPushSender, web: WebPushSender): readonly PushSender[] => [expo, web],
      inject: [ExpoPushSender, WebPushSender],
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
    {
      // Null disables the Web Push channel and makes the public-key endpoint answer 503, instead
      // of the API refusing to boot. A half-configured pair already failed at startup validation.
      provide: VAPID_KEYS,
      useFactory: (config: ConfigService<Environment, true>) =>
        createVapidKeys({
          VAPID_PUBLIC_KEY: config.get('VAPID_PUBLIC_KEY', { infer: true }),
          VAPID_PRIVATE_KEY: config.get('VAPID_PRIVATE_KEY', { infer: true }),
          VAPID_SUBJECT: config.get('VAPID_SUBJECT', { infer: true }),
        }),
      inject: [ConfigService],
    },
  ],
})
export class NotificationsModule {}
