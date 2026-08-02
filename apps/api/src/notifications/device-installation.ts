import type { DevicePlatform, NotificationChannel } from '@nido/contracts';

/** A device installation as stored, minus the credential — which never leaves the repository. */
export interface DeviceInstallationRecord {
  readonly id: string;
  readonly userId: string;
  readonly installationId: string;
  readonly platform: DevicePlatform;
  readonly channel: NotificationChannel;
  readonly lastSeenAt: Date;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RegisterDeviceRecordInput {
  readonly userId: string;
  readonly installationId: string;
  readonly platform: DevicePlatform;
  readonly channel: NotificationChannel;
  /** Already sealed by the cipher; the repository stores it verbatim. */
  readonly credentialCiphertext: string;
  readonly credentialFingerprint: string;
  readonly now: Date;
}
