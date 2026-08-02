import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

import type { CredentialKeyring } from './credential-keyring.js';

export const CREDENTIAL_CIPHER = Symbol('CREDENTIAL_CIPHER');

const ENVELOPE_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Protects push credentials at rest. Both channels go through it, not just Web Push as
 * docs/system-design.md §13 requires at minimum: an Expo token is also a capability that lets its
 * holder push to a specific device, so unifying them leaves one code path instead of two with
 * different rules (ADR 0012).
 */
export interface CredentialCipher {
  /**
   * Seals `plaintext` under the active key. `aad` is authenticated but not encrypted, and callers
   * must pass the value that identifies the row — moving a ciphertext between rows then fails to
   * decrypt instead of silently impersonating another device.
   */
  encrypt(plaintext: string, aad: string): string;
  decrypt(envelope: string, aad: string): string;
  /** Deterministic one-way digest used by the partial unique index on active installs. */
  fingerprint(plaintext: string): string;
}

export class CredentialDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialDecryptionError';
  }
}

/** The AAD that binds an envelope to the installation row that owns it. */
export function credentialAad(installationId: string, channel: string): string {
  return `${installationId}|${channel}`;
}

export class AesGcmCredentialCipher implements CredentialCipher {
  constructor(private readonly keyring: CredentialKeyring) {}

  encrypt(plaintext: string, aad: string): string {
    const key = this.keyring.keys.get(this.keyring.activeKeyId);
    if (key === undefined) {
      throw new Error('The active credential key disappeared from the keyring');
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const sealed = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

    // The key id travels with the envelope so a retired key can still decrypt its own rows;
    // rotation is a config change, not a data migration.
    return [
      ENVELOPE_VERSION,
      this.keyring.activeKeyId,
      iv.toString('base64url'),
      sealed.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string, aad: string): string {
    const parts = envelope.split('.');
    const [version, keyId, encodedIv, encodedSealed] = parts;
    if (parts.length !== 4 || version !== ENVELOPE_VERSION || keyId === undefined) {
      throw new CredentialDecryptionError('Unrecognized credential envelope');
    }

    const key = this.keyring.keys.get(keyId);
    if (key === undefined) {
      throw new CredentialDecryptionError(`No credential key available for key id ${keyId}`);
    }

    const iv = Buffer.from(encodedIv ?? '', 'base64url');
    const sealed = Buffer.from(encodedSealed ?? '', 'base64url');
    if (iv.byteLength !== IV_BYTES || sealed.byteLength <= TAG_BYTES) {
      throw new CredentialDecryptionError('Malformed credential envelope');
    }

    const ciphertext = sealed.subarray(0, sealed.byteLength - TAG_BYTES);
    const tag = sealed.subarray(sealed.byteLength - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // A wrong AAD and a tampered ciphertext are indistinguishable here by design — GCM only
      // reports that authentication failed, and the message deliberately carries no detail that
      // could help an attacker tell the two apart.
      throw new CredentialDecryptionError('Credential envelope failed authentication');
    }
  }

  fingerprint(plaintext: string): string {
    // Hex, so it is exactly the 64 characters the CHAR(64) column expects.
    return createHmac('sha256', this.keyring.pepper).update(plaintext, 'utf8').digest('hex');
  }
}
