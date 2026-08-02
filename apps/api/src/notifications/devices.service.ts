import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type {
  DeviceCredential,
  DeviceInstallation,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
} from '@nido/contracts';

import { CLOCK, type Clock } from '../common/clock.js';
import type { LocalUser } from '../users/user.js';
import { CREDENTIAL_CIPHER, credentialAad, type CredentialCipher } from './credential-cipher.js';
import type { DeviceInstallationRecord } from './device-installation.js';
import { DEVICES_REPOSITORY, type DevicesRepository } from './devices.repository.js';

const NOTIFICATIONS_UNAVAILABLE = 'Notifications are not available';
const DEVICE_UNAVAILABLE = 'Device is unavailable';

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DEVICES_REPOSITORY)
    private readonly devices: DevicesRepository,
    @Inject(CREDENTIAL_CIPHER)
    private readonly cipher: CredentialCipher | null,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async register(user: LocalUser, request: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    // Fail closed (ADR 0004): with no keyring there is nowhere safe to put the credential, so the
    // request is refused rather than stored in the clear or silently dropped.
    const cipher = this.requireCipher();

    const channel = request.credential.kind;
    const plaintext = serializeCredential(request.credential);
    const installation = await this.devices.register({
      userId: user.id,
      installationId: request.installationId,
      platform: request.platform,
      channel,
      credentialCiphertext: cipher.encrypt(
        plaintext,
        credentialAad(request.installationId, channel),
      ),
      credentialFingerprint: cipher.fingerprint(plaintext),
      now: this.clock.now(),
    });

    return { device: toDeviceInstallation(installation) };
  }

  async deactivate(user: LocalUser, deviceId: string): Promise<void> {
    const deactivated = await this.devices.deactivate(user.id, deviceId, this.clock.now());
    if (!deactivated) {
      // Someone else's device and a nonexistent one are the same answer on purpose: a different
      // status would let a caller enumerate other users' installations.
      throw new NotFoundException(DEVICE_UNAVAILABLE);
    }
  }

  private requireCipher(): CredentialCipher {
    if (this.cipher === null) {
      throw new ServiceUnavailableException(NOTIFICATIONS_UNAVAILABLE);
    }
    return this.cipher;
  }
}

/**
 * The credential is sealed as one opaque string so the cipher has a single input regardless of
 * channel. Web Push needs all three fields to send, so they travel together.
 */
function serializeCredential(credential: DeviceCredential): string {
  return credential.kind === 'EXPO'
    ? credential.token
    : JSON.stringify({
        endpoint: credential.endpoint,
        p256dh: credential.keys.p256dh,
        auth: credential.keys.auth,
      });
}

function toDeviceInstallation(record: DeviceInstallationRecord): DeviceInstallation {
  return {
    id: record.id,
    installationId: record.installationId,
    platform: record.platform,
    channel: record.channel,
    lastSeenAt: record.lastSeenAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
