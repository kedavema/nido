const SECURE_STORE_PREFIX = 'nido.firebase-auth.';

export function encodeSecureStoreKey(key: string): string {
  let encoded = SECURE_STORE_PREFIX;

  for (const character of key) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      throw new Error('No se pudo codificar la clave de persistencia.');
    }

    encoded += codePoint.toString(16).padStart(6, '0');
  }

  return encoded;
}
