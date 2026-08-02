import type { DeviceInstallationRecord, RegisterDeviceRecordInput } from './device-installation.js';

export const DEVICES_REPOSITORY = Symbol('DEVICES_REPOSITORY');

export interface DevicesRepository {
  /**
   * Idempotent by `installationId`. Re-registering the same install updates the credential,
   * platform, channel and `lastSeenAt` instead of inserting a second row; if the install belonged
   * to another user it changes hands, so nobody stays subscribed to a phone they signed out of.
   */
  register(input: RegisterDeviceRecordInput): Promise<DeviceInstallationRecord>;

  /**
   * Logical deactivation of one of the caller's own installs. Returns false when the id is not an
   * active install of that user — the caller cannot tell "someone else's" from "does not exist".
   */
  deactivate(userId: string, deviceId: string, now: Date): Promise<boolean>;
}
