import { afterEach, describe, expect, it } from 'vitest';

import { resolveApiUrl } from './api-url';

const original = process.env.EXPO_PUBLIC_API_URL;

afterEach(() => {
  if (original === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
    return;
  }
  process.env.EXPO_PUBLIC_API_URL = original;
});

describe('resolveApiUrl (native)', () => {
  it('returns the configured absolute URL', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';

    expect(resolveApiUrl()).toBe('https://api.example.com');
  });

  /**
   * Native has no same-origin fallback on purpose — an APK carries no page origin, and is rebuilt
   * to change backends anyway. `undefined` lets `parsePublicEnvironment` raise its usual `apiUrl`
   * field error instead of a second, differently-shaped failure.
   */
  it('returns undefined when nothing is configured', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    expect(resolveApiUrl()).toBeUndefined();
  });

  it('treats an empty value as absent rather than as a URL', () => {
    process.env.EXPO_PUBLIC_API_URL = '';

    expect(resolveApiUrl()).toBeUndefined();
  });
});
