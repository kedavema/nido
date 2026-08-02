import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'nido.notifications.installationId';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'nido-notifications',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * The stable identity of this app installation (ADR 0012). Generated once and kept, so that
 * re-registering after a provider token rotation or a re-login updates the existing row instead of
 * creating a second one — which is what stops the same phone from receiving duplicate push.
 *
 * It is not a secret: it identifies an install, and the server pairs it with the authenticated
 * user. It is stored in the keychain on native only because that is the storage the app already
 * has; on web `localStorage` is the equivalent per-origin store.
 */
export async function getOrCreateInstallationId(): Promise<string> {
  const existing = await readStoredInstallationId();
  if (existing !== null) {
    return existing;
  }

  const created = Crypto.randomUUID();
  await writeInstallationId(created);
  return created;
}

async function readStoredInstallationId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return readWebInstallationId();
  }
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY, secureStoreOptions);
  } catch {
    // A keychain that cannot be read yields a fresh id rather than a crash: the worst case is one
    // extra installation row, and the server retires the stale one on credential collision.
    return null;
  }
}

async function writeInstallationId(installationId: string): Promise<void> {
  if (Platform.OS === 'web') {
    writeWebInstallationId(installationId);
    return;
  }
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, installationId, secureStoreOptions);
  } catch {
    // Registration still works with an id that does not survive a restart; losing it degrades
    // deduplication, it does not break notifications.
  }
}

function readWebInstallationId(): string | null {
  try {
    // Safari in private mode throws on access rather than returning null, so this is guarded even
    // though the type says the API is always there.
    return globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeWebInstallationId(installationId: string): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, installationId);
  } catch {
    // Same as native: a non-persistent id is a degraded but working registration.
  }
}
