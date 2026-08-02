export const VAPID_KEYS = Symbol('VAPID_KEYS');

export interface VapidKeys {
  readonly publicKey: string;
  readonly privateKey: string;
  /** `mailto:` or `https:` contact the push service can use to reach us (RFC 8292). */
  readonly subject: string;
}

export interface VapidEnvironment {
  readonly VAPID_PUBLIC_KEY?: string | undefined;
  readonly VAPID_PRIVATE_KEY?: string | undefined;
  readonly VAPID_SUBJECT?: string | undefined;
}

/**
 * Builds the VAPID key pair, or returns null when Web Push is simply not configured.
 *
 * Same all-or-nothing rule as the credential keyring: no configuration is a legitimate state that
 * disables the channel, while a half-configured one is a deployment mistake that must surface at
 * boot rather than on the first send.
 */
export function createVapidKeys(environment: VapidEnvironment): VapidKeys | null {
  const publicKey = environment.VAPID_PUBLIC_KEY;
  const privateKey = environment.VAPID_PRIVATE_KEY;
  const subject = environment.VAPID_SUBJECT;
  const provided = [publicKey, privateKey, subject].filter(
    (value) => value !== undefined && value.length > 0,
  );

  if (provided.length === 0) {
    return null;
  }
  if (
    provided.length < 3 ||
    publicKey === undefined ||
    privateKey === undefined ||
    subject === undefined
  ) {
    throw new Error(
      'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured together',
    );
  }
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new Error('VAPID_SUBJECT must be a mailto: or https:// URL');
  }

  return { publicKey, privateKey, subject };
}
