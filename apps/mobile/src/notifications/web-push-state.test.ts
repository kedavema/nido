import { describe, expect, it } from 'vitest';

import { decodeVapidPublicKey, isIosBrowser, resolveWebPushState } from './web-push-state';

const supported = {
  isSecureContext: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default' as NotificationPermission | null,
  isIos: false,
  isStandalone: false,
  hasSubscription: false,
};

describe('resolveWebPushState', () => {
  it('offers to ask when everything is supported and nothing was refused', () => {
    expect(resolveWebPushState(supported)).toEqual({ kind: 'available' });
  });

  it('reports an active subscription only when permission is still granted', () => {
    expect(
      resolveWebPushState({ ...supported, hasSubscription: true, permission: 'granted' }),
    ).toEqual({ kind: 'subscribed' });

    // A subscription left behind after the user revoked permission in system settings is not an
    // active state — showing "activado" there would be a lie.
    expect(
      resolveWebPushState({ ...supported, hasSubscription: true, permission: 'denied' }),
    ).toEqual({ kind: 'denied' });
  });

  it('tells an iPhone user to install the app instead of calling it unsupported', () => {
    // iOS reports no PushManager until the PWA is on the Home Screen, so "unsupported" would be
    // both wrong and a dead end; the user has a concrete next step.
    expect(
      resolveWebPushState({
        ...supported,
        hasPushManager: false,
        isIos: true,
        isStandalone: false,
      }),
    ).toEqual({ kind: 'needs-install' });
  });

  it('still asks for installation on iOS even when the APIs look present', () => {
    expect(resolveWebPushState({ ...supported, isIos: true, isStandalone: false })).toEqual({
      kind: 'needs-install',
    });
  });

  it('treats an installed iPhone PWA like any other supported browser', () => {
    expect(resolveWebPushState({ ...supported, isIos: true, isStandalone: true })).toEqual({
      kind: 'available',
    });
  });

  it.each([
    ['an insecure context', { isSecureContext: false }],
    ['no service worker', { hasServiceWorker: false }],
    ['no push manager', { hasPushManager: false }],
    ['no notification api', { hasNotification: false }],
  ])('reports unsupported for %s on a non-iOS browser', (_label, overrides) => {
    expect(resolveWebPushState({ ...supported, ...overrides })).toEqual({ kind: 'unsupported' });
  });

  it('reports denied without offering an action the app cannot perform', () => {
    // Only system settings can undo a refusal, so this state must never render an enable button.
    expect(resolveWebPushState({ ...supported, permission: 'denied' })).toEqual({ kind: 'denied' });
  });
});

describe('decodeVapidPublicKey', () => {
  it('decodes an unpadded base64url key to raw bytes', () => {
    const bytes = decodeVapidPublicKey('BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo');

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(24);
  });

  it('produces the same bytes whether or not the key carries padding', () => {
    // Browsers differ on accepting padding, so normalizing it is what keeps one served key working
    // everywhere.
    expect([...decodeVapidPublicKey('SGVsbG8')]).toEqual([...decodeVapidPublicKey('SGVsbG8=')]);
  });

  it('translates the url-safe alphabet back before decoding', () => {
    // `-` and `_` are not valid base64; leaving them would decode to different bytes or throw.
    expect([...decodeVapidPublicKey('-_8')]).toEqual([0xfb, 0xff]);
  });
});

describe('isIosBrowser', () => {
  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15',
  ])('recognizes %s', (userAgent) => {
    expect(isIosBrowser(userAgent)).toBe(true);
  });

  it('does not mistake a desktop browser for iOS', () => {
    expect(isIosBrowser('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120')).toBe(
      false,
    );
  });
});
