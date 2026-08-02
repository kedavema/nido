const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;
const AES_256_KEY_BYTES = 32;
const MIN_PEPPER_BYTES = 32;

export interface CredentialKeyring {
  /** Every key that can still decrypt, indexed by the id embedded in each envelope. */
  readonly keys: ReadonlyMap<string, Buffer>;
  /** The key new envelopes are sealed with. Rotation means pointing this at a newer entry. */
  readonly activeKeyId: string;
  /** Separate secret for the deterministic credential fingerprint — never a decryption key. */
  readonly pepper: Buffer;
}

export interface CredentialKeyringEnvironment {
  readonly NOTIFICATION_CREDENTIAL_KEYS?: string | undefined;
  readonly NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID?: string | undefined;
  readonly NOTIFICATION_CREDENTIAL_PEPPER?: string | undefined;
}

/**
 * Parses `keyId:base64Key,keyId:base64Key`. Retired keys stay listed so envelopes sealed under
 * them keep decrypting; only the active id is used to seal (ADR 0012).
 */
export function parseCredentialKeys(value: string): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();

  for (const entry of value.split(',')) {
    const separator = entry.indexOf(':');
    if (separator === -1) {
      throw new Error('Each credential key must be formatted as keyId:base64Key');
    }

    const keyId = entry.slice(0, separator).trim();
    const encodedKey = entry.slice(separator + 1).trim();
    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new Error('A credential key id must be 1-32 url-safe characters');
    }
    if (keys.has(keyId)) {
      throw new Error(`Duplicate credential key id: ${keyId}`);
    }

    const key = Buffer.from(encodedKey, 'base64');
    if (key.byteLength !== AES_256_KEY_BYTES) {
      throw new Error(`Credential key ${keyId} must decode to exactly 32 bytes`);
    }
    keys.set(keyId, key);
  }

  if (keys.size === 0) {
    throw new Error('The credential keyring must define at least one key');
  }
  return keys;
}

/**
 * Builds the keyring, or returns null when notifications are simply not configured.
 *
 * The three variables are all-or-nothing: a half-configured keyring is a deployment mistake that
 * must surface at boot, while no configuration at all is a legitimate state (local development,
 * and every test that does not touch notifications). In that state the device endpoints fail
 * closed rather than the API refusing to start (ADR 0004).
 */
export function createCredentialKeyring(
  environment: CredentialKeyringEnvironment,
): CredentialKeyring | null {
  const encodedKeys = environment.NOTIFICATION_CREDENTIAL_KEYS;
  const activeKeyId = environment.NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID;
  const encodedPepper = environment.NOTIFICATION_CREDENTIAL_PEPPER;
  const provided = [encodedKeys, activeKeyId, encodedPepper].filter(
    (value) => value !== undefined && value.length > 0,
  );

  if (provided.length === 0) {
    return null;
  }
  if (provided.length < 3 || encodedKeys === undefined || activeKeyId === undefined) {
    throw new Error(
      'NOTIFICATION_CREDENTIAL_KEYS, NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID and NOTIFICATION_CREDENTIAL_PEPPER must be configured together',
    );
  }

  const keys = parseCredentialKeys(encodedKeys);
  if (!keys.has(activeKeyId)) {
    // Catching this at boot matters: sealing with a missing key would otherwise fail on the first
    // device registration, long after the deploy looked successful.
    throw new Error(`The active credential key id ${activeKeyId} is not present in the keyring`);
  }

  const pepper = Buffer.from(encodedPepper ?? '', 'base64');
  if (pepper.byteLength < MIN_PEPPER_BYTES) {
    throw new Error('NOTIFICATION_CREDENTIAL_PEPPER must decode to at least 32 bytes');
  }

  return { keys, activeKeyId, pepper };
}
