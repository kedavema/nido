import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { RegisterDeviceRequest } from '@nido/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { CredentialCipher } from '../src/notifications/credential-cipher.js';
import type { DeviceInstallationRecord } from '../src/notifications/device-installation.js';
import type { DevicesRepository } from '../src/notifications/devices.repository.js';
import { DevicesService } from '../src/notifications/devices.service.js';
import type { LocalUser } from '../src/users/user.js';

const now = new Date('2026-08-02T12:00:00.000Z');
const clock = { now: () => now };

const user = {
  id: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
  firebaseUid: 'firebase-owner',
  email: 'owner@example.com',
  displayName: 'Owner',
  avatarUrl: null,
  timezone: 'America/Asuncion',
  createdAt: now,
  updatedAt: now,
} satisfies LocalUser;

const installationId = '6f1c9a1e-4b52-4c2a-9a3f-1d2e3f4a5b6c';

const expoRequest = {
  installationId,
  platform: 'ANDROID',
  credential: { kind: 'EXPO', token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]' },
} satisfies RegisterDeviceRequest;

const webPushRequest = {
  installationId,
  platform: 'WEB',
  credential: {
    kind: 'WEB_PUSH',
    endpoint: 'https://web.push.apple.com/QWERTY-abc_123',
    keys: { p256dh: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo', auth: 'tBHItJI5svbpez7KI4CCXg' },
  },
} satisfies RegisterDeviceRequest;

const storedRecord = {
  id: '0b2b1f7a-2f8d-4a6b-8f1e-9c7d6e5f4a3b',
  userId: user.id,
  installationId,
  platform: 'ANDROID',
  channel: 'EXPO',
  lastSeenAt: now,
  deactivatedAt: null,
  createdAt: now,
  updatedAt: now,
} satisfies DeviceInstallationRecord;

/**
 * The spies are returned alongside the object rather than read back off it, so assertions never
 * detach a method from its receiver.
 */
function fakeCipher() {
  const encrypt = vi.fn((plaintext: string, aad: string) => `sealed(${plaintext})@${aad}`);
  const fingerprint = vi.fn(() => 'f'.repeat(64));
  const cipher: CredentialCipher = { encrypt, decrypt: vi.fn(() => ''), fingerprint };
  return { cipher, encrypt, fingerprint };
}

function fakeRepository(deactivateResult = true) {
  const register = vi.fn(() => Promise.resolve(storedRecord));
  const deactivate = vi.fn(() => Promise.resolve(deactivateResult));
  const repository: DevicesRepository = { register, deactivate };
  return { repository, register, deactivate };
}

describe('DevicesService', () => {
  it('seals the credential under an AAD bound to the installation and channel', async () => {
    const { cipher, encrypt } = fakeCipher();
    const { repository, register } = fakeRepository();
    const service = new DevicesService(repository, cipher, clock);

    await service.register(user, expoRequest);

    // The AAD is what stops a ciphertext being moved onto another installation row, so the exact
    // value the service passes is worth pinning.
    expect(encrypt).toHaveBeenCalledWith(expoRequest.credential.token, `${installationId}|EXPO`);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, channel: 'EXPO', now }),
    );
  });

  it('seals every Web Push field together, since sending needs all three', async () => {
    const { cipher, encrypt } = fakeCipher();
    const service = new DevicesService(fakeRepository().repository, cipher, clock);

    await service.register(user, webPushRequest);

    const [plaintext, aad] = encrypt.mock.calls[0] ?? [];
    expect(aad).toBe(`${installationId}|WEB_PUSH`);
    expect(JSON.parse(plaintext ?? '')).toEqual({
      endpoint: webPushRequest.credential.endpoint,
      p256dh: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    });
  });

  it('never returns the credential it was given', async () => {
    const service = new DevicesService(fakeRepository().repository, fakeCipher().cipher, clock);

    const response = await service.register(user, expoRequest);

    expect(JSON.stringify(response)).not.toContain('ExponentPushToken');
    expect(response.device).not.toHaveProperty('credential');
  });

  it('refuses to register when no keyring is configured', async () => {
    const { repository, register } = fakeRepository();
    const service = new DevicesService(repository, null, clock);

    // Fail closed (ADR 0004): with nowhere safe to put the credential the request is refused,
    // rather than stored in the clear or accepted and silently dropped.
    await expect(service.register(user, expoRequest)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(register).not.toHaveBeenCalled();
  });

  it('reports a device that is not the caller own as not found', async () => {
    const service = new DevicesService(
      fakeRepository(false).repository,
      fakeCipher().cipher,
      clock,
    );

    await expect(service.deactivate(user, storedRecord.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deactivates without a keyring, because destroying a credential needs no key', async () => {
    const { repository, deactivate } = fakeRepository();
    const service = new DevicesService(repository, null, clock);

    await expect(service.deactivate(user, storedRecord.id)).resolves.toBeUndefined();
    expect(deactivate).toHaveBeenCalledWith(user.id, storedRecord.id, now);
  });
});
