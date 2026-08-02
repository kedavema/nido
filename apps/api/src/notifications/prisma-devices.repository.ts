import { Injectable } from '@nestjs/common';
import type { DevicePlatform, NotificationChannel } from '@nido/contracts';

import { PrismaService } from '../database/prisma.service.js';
import type { DeviceInstallationRecord, RegisterDeviceRecordInput } from './device-installation.js';
import type { DevicesRepository } from './devices.repository.js';

/** Deactivation clears both credential columns; the check constraints require them to move together. */
const DEACTIVATED_CREDENTIAL = {
  credentialCiphertext: null,
  credentialFingerprint: null,
} as const;

@Injectable()
export class PrismaDevicesRepository implements DevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterDeviceRecordInput): Promise<DeviceInstallationRecord> {
    return this.prisma.$transaction(async (transaction) => {
      // A reinstall can hand the same provider token to a fresh installation id. The partial
      // unique index would reject the insert, so the older install is retired first — that is
      // exactly the duplicate-push case the index exists to catch, and retiring is the right
      // resolution because the token now belongs to the new install.
      await transaction.deviceInstallation.updateMany({
        where: {
          credentialFingerprint: input.credentialFingerprint,
          deactivatedAt: null,
          installationId: { not: input.installationId },
        },
        data: { deactivatedAt: input.now, ...DEACTIVATED_CREDENTIAL },
      });

      const installation = await transaction.deviceInstallation.upsert({
        where: { installationId: input.installationId },
        create: {
          userId: input.userId,
          installationId: input.installationId,
          platform: input.platform,
          channel: input.channel,
          credentialCiphertext: input.credentialCiphertext,
          credentialFingerprint: input.credentialFingerprint,
          lastSeenAt: input.now,
        },
        update: {
          // userId is updated too: a second user signing in on this phone takes the install over,
          // instead of leaving the previous user subscribed to a device they signed out of.
          userId: input.userId,
          platform: input.platform,
          channel: input.channel,
          credentialCiphertext: input.credentialCiphertext,
          credentialFingerprint: input.credentialFingerprint,
          lastSeenAt: input.now,
          deactivatedAt: null,
        },
      });

      return toDeviceInstallationRecord(installation);
    });
  }

  async deactivate(userId: string, deviceId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const owned = await transaction.deviceInstallation.findFirst({
        where: { id: deviceId, userId },
        select: { id: true },
      });
      if (owned === null) {
        return false;
      }

      // Scoped to still-active rows so a repeated delete is a no-op rather than restamping the
      // deactivation time; the caller still gets the same 204 either way.
      await transaction.deviceInstallation.updateMany({
        where: { id: deviceId, deactivatedAt: null },
        data: { deactivatedAt: now, ...DEACTIVATED_CREDENTIAL },
      });
      return true;
    });
  }
}

interface PrismaDeviceInstallation {
  readonly id: string;
  readonly userId: string;
  readonly installationId: string;
  readonly platform: string;
  readonly channel: string;
  readonly lastSeenAt: Date;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toDeviceInstallationRecord(
  installation: PrismaDeviceInstallation,
): DeviceInstallationRecord {
  return {
    id: installation.id,
    userId: installation.userId,
    installationId: installation.installationId,
    platform: installation.platform as DevicePlatform,
    channel: installation.channel as NotificationChannel,
    lastSeenAt: installation.lastSeenAt,
    deactivatedAt: installation.deactivatedAt,
    createdAt: installation.createdAt,
    updatedAt: installation.updatedAt,
  };
}
