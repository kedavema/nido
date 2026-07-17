import * as SecureStore from 'expo-secure-store';
import type { ReactNativeAsyncStorage } from 'firebase/auth';

import { encodeSecureStoreKey } from './secure-store-key';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'nido-firebase-auth',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureFirebasePersistenceStorage: ReactNativeAsyncStorage = {
  getItem(key) {
    return SecureStore.getItemAsync(encodeSecureStoreKey(key), secureStoreOptions);
  },
  setItem(key, value) {
    return SecureStore.setItemAsync(encodeSecureStoreKey(key), value, secureStoreOptions);
  },
  removeItem(key) {
    return SecureStore.deleteItemAsync(encodeSecureStoreKey(key), secureStoreOptions);
  },
};
