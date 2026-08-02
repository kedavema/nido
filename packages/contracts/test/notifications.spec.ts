import { describe, expect, it } from 'vitest';

import {
  DeviceCredentialSchema,
  DeviceInstallationSchema,
  DispatchNotificationsResponseSchema,
  RegisterDeviceRequestSchema,
  RegisterDeviceResponseSchema,
  VapidPublicKeyResponseSchema,
} from '../src/index.js';

const installationId = '6f1c9a1e-4b52-4c2a-9a3f-1d2e3f4a5b6c';

const expoCredential = {
  kind: 'EXPO',
  token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
};

const webPushCredential = {
  kind: 'WEB_PUSH',
  endpoint: 'https://web.push.apple.com/QWERTY-abc_123',
  keys: {
    p256dh: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKgPpWG5Kb3sVjA-8b5F5Q1',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

const androidRequest = {
  installationId,
  platform: 'ANDROID',
  credential: expoCredential,
};

const webRequest = {
  installationId,
  platform: 'WEB',
  credential: webPushCredential,
};

const validInstallation = {
  id: '0b2b1f7a-2f8d-4a6b-8f1e-9c7d6e5f4a3b',
  installationId,
  platform: 'ANDROID',
  channel: 'EXPO',
  lastSeenAt: '2026-08-02T12:00:00.000Z',
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-02T12:00:00.000Z',
};

describe('DeviceCredentialSchema', () => {
  it('accepts both provider-neutral credential shapes', () => {
    expect(DeviceCredentialSchema.parse(expoCredential)).toEqual(expoCredential);
    expect(DeviceCredentialSchema.parse(webPushCredential)).toEqual(webPushCredential);
  });

  it('accepts the legacy ExpoPushToken prefix', () => {
    const legacy = { kind: 'EXPO', token: 'ExpoPushToken[yyyyyyyyyyyyyyyyyyyyyy]' };
    expect(DeviceCredentialSchema.parse(legacy)).toEqual(legacy);
  });

  it('rejects a token that is not shaped like an Expo push token', () => {
    expect(DeviceCredentialSchema.safeParse({ kind: 'EXPO', token: 'not-a-token' }).success).toBe(
      false,
    );
    expect(
      DeviceCredentialSchema.safeParse({ kind: 'EXPO', token: 'ExponentPushToken[]' }).success,
    ).toBe(false);
  });

  it('rejects a Web Push endpoint that is not https', () => {
    const insecure = {
      ...webPushCredential,
      endpoint: 'http://web.push.apple.com/QWERTY-abc_123',
    };
    expect(DeviceCredentialSchema.safeParse(insecure).success).toBe(false);
  });

  it('rejects Web Push keys that are not base64url', () => {
    const padded = {
      ...webPushCredential,
      keys: { ...webPushCredential.keys, auth: 'tBHItJI5svbpez7KI4CC+g' },
    };
    expect(DeviceCredentialSchema.safeParse(padded).success).toBe(false);
  });

  it('rejects an unknown channel discriminator', () => {
    expect(DeviceCredentialSchema.safeParse({ kind: 'FCM', token: 'whatever' }).success).toBe(
      false,
    );
  });
});

describe('RegisterDeviceRequestSchema', () => {
  it('accepts each platform paired with its own channel', () => {
    expect(RegisterDeviceRequestSchema.parse(androidRequest)).toEqual(androidRequest);
    expect(RegisterDeviceRequestSchema.parse(webRequest)).toEqual(webRequest);
  });

  it('rejects a platform paired with the other platform credential', () => {
    const mismatched = RegisterDeviceRequestSchema.safeParse({
      ...androidRequest,
      credential: webPushCredential,
    });
    expect(mismatched.success).toBe(false);
    expect(mismatched.error?.issues[0]?.path).toEqual(['credential', 'kind']);
  });

  it('rejects a body that tries to choose its own user', () => {
    // The authenticated user is derived from the verified Firebase token, never from the body
    // (docs/system-design.md §13); strictObject is what enforces that at the contract boundary.
    const spoofed = {
      ...androidRequest,
      userId: 'b3c4d5e6-7f80-4a1b-9c2d-3e4f5a6b7c8d',
    };
    expect(RegisterDeviceRequestSchema.safeParse(spoofed).success).toBe(false);
  });

  it('rejects an installation id that is not a uuid', () => {
    expect(
      RegisterDeviceRequestSchema.safeParse({ ...androidRequest, installationId: 'device-1' })
        .success,
    ).toBe(false);
  });
});

describe('DeviceInstallationSchema', () => {
  it('accepts an installation without any credential material', () => {
    expect(DeviceInstallationSchema.parse(validInstallation)).toEqual(validInstallation);
    expect(RegisterDeviceResponseSchema.parse({ device: validInstallation })).toEqual({
      device: validInstallation,
    });
  });

  it('rejects a response that carries the stored credential', () => {
    // The encrypted token/subscription must never leave the API, so the response schema rejects it
    // instead of depending on every call site to strip it (ADR 0012).
    expect(
      DeviceInstallationSchema.safeParse({ ...validInstallation, credential: expoCredential })
        .success,
    ).toBe(false);
    expect(
      DeviceInstallationSchema.safeParse({
        ...validInstallation,
        credentialCiphertext: 'v1.k1.aaaa.bbbb',
      }).success,
    ).toBe(false);
  });
});

describe('VapidPublicKeyResponseSchema', () => {
  it('accepts a base64url public key', () => {
    const response = { publicKey: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKgPpWG5Kb3sVjA' };
    expect(VapidPublicKeyResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects a key with characters outside the base64url alphabet', () => {
    expect(VapidPublicKeyResponseSchema.safeParse({ publicKey: 'not/base64url+key' }).success).toBe(
      false,
    );
  });
});

describe('DispatchNotificationsResponseSchema', () => {
  it('accepts aggregate counters', () => {
    const response = { claimed: 3, sent: 2, failed: 1, skipped: false };
    expect(DispatchNotificationsResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects negative or fractional counters', () => {
    expect(
      DispatchNotificationsResponseSchema.safeParse({
        claimed: -1,
        sent: 0,
        failed: 0,
        skipped: false,
      }).success,
    ).toBe(false);
    expect(
      DispatchNotificationsResponseSchema.safeParse({
        claimed: 1.5,
        sent: 0,
        failed: 0,
        skipped: false,
      }).success,
    ).toBe(false);
  });

  it('rejects per-occurrence detail leaking into the job response', () => {
    // §13: the job response is safe to log precisely because it carries no ids or amounts.
    expect(
      DispatchNotificationsResponseSchema.safeParse({
        claimed: 1,
        sent: 1,
        failed: 0,
        skipped: false,
        occurrenceIds: ['0b2b1f7a-2f8d-4a6b-8f1e-9c7d6e5f4a3b'],
      }).success,
    ).toBe(false);
  });
});
