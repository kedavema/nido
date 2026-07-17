import { describe, expect, it } from 'vitest';

import { encodeSecureStoreKey } from './secure-store-key';

describe('secure Firebase persistence keys', () => {
  it('uses only SecureStore-safe characters and a private namespace', () => {
    const encoded = encodeSecureStoreKey('firebase:authUser:api/key@[DEFAULT]');

    expect(encoded).toMatch(/^nido\.firebase-auth\.[a-f0-9]+$/u);
    expect(encoded).not.toContain(':');
    expect(encoded).not.toContain('/');
  });

  it('is deterministic and collision-free for similar and Unicode keys', () => {
    const unicodeKey = 'auth-ñ';
    const keys = ['auth/key', 'auth:key', 'auth-key', unicodeKey, 'auth-n'];
    const encoded = keys.map(encodeSecureStoreKey);

    expect(new Set(encoded).size).toBe(keys.length);
    expect(encodeSecureStoreKey(unicodeKey)).toBe(encoded[3]);
  });
});
