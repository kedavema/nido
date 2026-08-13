import { afterEach, describe, expect, it } from 'vitest';

import { SAME_ORIGIN_API_PATH, resolveApiUrl } from './api-url.web';

const originalUrl = process.env.EXPO_PUBLIC_API_URL;
const originalWindow = Reflect.get(globalThis, 'window') as unknown;

function setOrigin(origin: string | undefined): void {
  if (origin === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
    return;
  }
  Reflect.set(globalThis, 'window', { location: { origin } });
}

afterEach(() => {
  if (originalUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = originalUrl;
  }

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Reflect.set(globalThis, 'window', originalWindow);
  }
});

describe('resolveApiUrl (web)', () => {
  it('falls back to this page own origin, so the bundle carries no API URL', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    setOrigin('https://nido.pages.dev');

    expect(resolveApiUrl()).toBe(`https://nido.pages.dev${SAME_ORIGIN_API_PATH}`);
  });

  it('follows the origin it is actually served from', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    setOrigin('https://preview-abc.nido.pages.dev');

    expect(resolveApiUrl()).toBe(`https://preview-abc.nido.pages.dev${SAME_ORIGIN_API_PATH}`);
  });

  /** The local-development path: Expo dev server and API on two ports, no proxy between them. */
  it('prefers an explicit EXPO_PUBLIC_API_URL over the origin', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
    setOrigin('http://localhost:19006');

    expect(resolveApiUrl()).toBe('http://localhost:3000');
  });

  it('treats an empty value as absent', () => {
    process.env.EXPO_PUBLIC_API_URL = '';
    setOrigin('https://nido.pages.dev');

    expect(resolveApiUrl()).toBe(`https://nido.pages.dev${SAME_ORIGIN_API_PATH}`);
  });

  /**
   * `expo export` renders these routes to static HTML in Node, where there is no `window`. This
   * must degrade to the normal missing-configuration error rather than a ReferenceError that would
   * fail the build.
   */
  it('returns undefined during static rendering, where there is no window', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    setOrigin(undefined);

    expect(resolveApiUrl()).toBeUndefined();
  });
});
