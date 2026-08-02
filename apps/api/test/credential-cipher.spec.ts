import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  AesGcmCredentialCipher,
  credentialAad,
  CredentialDecryptionError,
} from '../src/notifications/credential-cipher.js';
import {
  createCredentialKeyring,
  parseCredentialKeys,
} from '../src/notifications/credential-keyring.js';

const keyOne = randomBytes(32);
const keyTwo = randomBytes(32);
const pepper = randomBytes(32);

const keyring = {
  keys: new Map([
    ['k1', keyOne],
    ['k2', keyTwo],
  ]),
  activeKeyId: 'k2',
  pepper,
};

const token = 'ExponentPushToken[abcdefghijklmnopqrstuv]';
const aad = credentialAad('6f1c9a1e-4b52-4c2a-9a3f-1d2e3f4a5b6c', 'EXPO');

function environmentFor(keys: string, activeKeyId: string): Record<string, string> {
  return {
    NOTIFICATION_CREDENTIAL_KEYS: keys,
    NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID: activeKeyId,
    NOTIFICATION_CREDENTIAL_PEPPER: pepper.toString('base64'),
  };
}

describe('AesGcmCredentialCipher', () => {
  const cipher = new AesGcmCredentialCipher(keyring);

  it('round-trips a credential under the active key', () => {
    const envelope = cipher.encrypt(token, aad);
    expect(cipher.decrypt(envelope, aad)).toBe(token);
  });

  it('stamps the envelope with its version and key id', () => {
    const [version, keyId] = cipher.encrypt(token, aad).split('.');
    expect(version).toBe('v1');
    // Rotation is a config change, not a data migration, precisely because this id travels along.
    expect(keyId).toBe('k2');
  });

  it('never produces the same envelope twice for the same input', () => {
    expect(cipher.encrypt(token, aad)).not.toBe(cipher.encrypt(token, aad));
  });

  it('refuses an envelope presented with a different AAD', () => {
    const envelope = cipher.encrypt(token, aad);
    const otherRow = credentialAad('0b2b1f7a-2f8d-4a6b-8f1e-9c7d6e5f4a3b', 'EXPO');

    // This is the whole point of binding the AAD to the row: a ciphertext copied onto another
    // installation fails to open instead of silently impersonating that device.
    expect(() => cipher.decrypt(envelope, otherRow)).toThrow(CredentialDecryptionError);
  });

  it('refuses a tampered ciphertext', () => {
    const [version, keyId, iv, sealed] = cipher.encrypt(token, aad).split('.');
    const flipped = `${(sealed ?? '').slice(0, -1)}${(sealed ?? '').endsWith('A') ? 'B' : 'A'}`;

    expect(() => cipher.decrypt([version, keyId, iv, flipped].join('.'), aad)).toThrow(
      CredentialDecryptionError,
    );
  });

  it('still decrypts envelopes sealed under a retired key', () => {
    const previous = new AesGcmCredentialCipher({ ...keyring, activeKeyId: 'k1' });
    const envelope = previous.encrypt(token, aad);

    // k1 is no longer the active key but is still listed, so its rows keep opening.
    expect(cipher.decrypt(envelope, aad)).toBe(token);
  });

  it('refuses an envelope whose key id is no longer in the keyring', () => {
    const retired = new AesGcmCredentialCipher({
      keys: new Map([['k0', randomBytes(32)]]),
      activeKeyId: 'k0',
      pepper,
    });
    const envelope = retired.encrypt(token, aad);

    expect(() => cipher.decrypt(envelope, aad)).toThrow(/No credential key available/u);
  });

  it.each(['plain-text', 'v2.k2.aa.bb', 'v1.k2.tooshort.bb', 'v1.k2'])(
    'refuses the malformed envelope %s',
    (envelope) => {
      expect(() => cipher.decrypt(envelope, aad)).toThrow(CredentialDecryptionError);
    },
  );

  describe('fingerprint', () => {
    it('is deterministic and exactly the width of the CHAR(64) column', () => {
      const digest = cipher.fingerprint(token);
      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[0-9a-f]{64}$/u);
      expect(cipher.fingerprint(token)).toBe(digest);
    });

    it('separates different credentials and different peppers', () => {
      const other = new AesGcmCredentialCipher({ ...keyring, pepper: randomBytes(32) });
      expect(cipher.fingerprint(token)).not.toBe(cipher.fingerprint(`${token} `));
      expect(cipher.fingerprint(token)).not.toBe(other.fingerprint(token));
    });
  });
});

describe('parseCredentialKeys', () => {
  it('reads several keys and preserves their ids', () => {
    const keys = parseCredentialKeys(
      `k1:${keyOne.toString('base64')}, k2:${keyTwo.toString('base64')}`,
    );
    expect([...keys.keys()]).toEqual(['k1', 'k2']);
    expect(keys.get('k1')?.equals(keyOne)).toBe(true);
  });

  it.each([
    ['a key without an id separator', keyOne.toString('base64')],
    ['a key id with unsafe characters', `k 1:${keyOne.toString('base64')}`],
    ['a key that is not 32 bytes', `k1:${randomBytes(16).toString('base64')}`],
    ['a duplicated key id', `k1:${keyOne.toString('base64')},k1:${keyTwo.toString('base64')}`],
  ])('rejects %s', (_label, value) => {
    expect(() => parseCredentialKeys(value)).toThrow();
  });
});

describe('createCredentialKeyring', () => {
  it('returns null when notifications are simply not configured', () => {
    // Not an error: local development and every test that does not touch notifications run this
    // way, and the device endpoints fail closed instead of the API refusing to boot.
    expect(createCredentialKeyring({})).toBeNull();
  });

  it('builds the keyring when all three variables are present', () => {
    const built = createCredentialKeyring(environmentFor(`k1:${keyOne.toString('base64')}`, 'k1'));
    expect(built?.activeKeyId).toBe('k1');
    expect(built?.keys.size).toBe(1);
  });

  it('rejects a half-configured keyring', () => {
    expect(() =>
      createCredentialKeyring({ NOTIFICATION_CREDENTIAL_KEYS: `k1:${keyOne.toString('base64')}` }),
    ).toThrow(/must be configured together/u);
  });

  it('rejects an active key id that is not in the keyring', () => {
    // Caught at boot on purpose: otherwise sealing would fail on the first device registration,
    // long after the deploy looked successful.
    expect(() =>
      createCredentialKeyring(environmentFor(`k1:${keyOne.toString('base64')}`, 'k9')),
    ).toThrow(/not present in the keyring/u);
  });

  it('rejects a pepper that is too short to be a secret', () => {
    expect(() =>
      createCredentialKeyring({
        ...environmentFor(`k1:${keyOne.toString('base64')}`, 'k1'),
        NOTIFICATION_CREDENTIAL_PEPPER: randomBytes(8).toString('base64'),
      }),
    ).toThrow(/at least 32 bytes/u);
  });
});
