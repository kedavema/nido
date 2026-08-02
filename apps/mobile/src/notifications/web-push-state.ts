/**
 * Pure Web Push decision logic. Deliberately free of `react-native` and browser globals at import
 * time, so it can be unit-tested in Node — the mobile test runner does not transform
 * `react-native`, and the branches worth testing are exactly the ones in here.
 */

/**
 * What the notifications screen renders. Each state exists because it needs different words and a
 * different (or no) action — collapsing them would produce a button that cannot do anything.
 */
export type WebPushState =
  /** No service worker or no Push API: nothing to offer, and no button to show. */
  | { readonly kind: 'unsupported' }
  /** iOS only allows Web Push from a Home Screen install, so the next step is installing. */
  | { readonly kind: 'needs-install' }
  /** The user said no. Only the OS settings can undo that, so the app must not pretend otherwise. */
  | { readonly kind: 'denied' }
  /** Supported and not refused: this is the only state where asking makes sense. */
  | { readonly kind: 'available' }
  | { readonly kind: 'subscribed' };

export interface WebPushEnvironment {
  readonly isSecureContext: boolean;
  readonly hasServiceWorker: boolean;
  readonly hasPushManager: boolean;
  readonly hasNotification: boolean;
  readonly permission: NotificationPermission | null;
  readonly isIos: boolean;
  readonly isStandalone: boolean;
  readonly hasSubscription: boolean;
}

/**
 * Decides which state to show from what the browser reports. Kept pure so every branch is testable
 * without a browser.
 */
export function resolveWebPushState(environment: WebPushEnvironment): WebPushState {
  if (
    !environment.isSecureContext ||
    !environment.hasServiceWorker ||
    !environment.hasPushManager ||
    !environment.hasNotification
  ) {
    // iOS reports no PushManager until the PWA is installed, so a plain "unsupported" there would
    // be wrong and unhelpful — the user has a concrete next step.
    return environment.isIos && !environment.isStandalone
      ? { kind: 'needs-install' }
      : { kind: 'unsupported' };
  }
  if (environment.isIos && !environment.isStandalone) {
    return { kind: 'needs-install' };
  }
  if (environment.permission === 'denied') {
    return { kind: 'denied' };
  }
  if (environment.hasSubscription && environment.permission === 'granted') {
    return { kind: 'subscribed' };
  }
  return { kind: 'available' };
}

/**
 * `applicationServerKey` takes raw bytes, while the API serves the key as base64url. Browsers
 * differ on whether they accept padding, so the padding is normalized before decoding.
 */
export function decodeVapidPublicKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const base64 = padded.replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = globalThis.atob(base64);
  // Explicitly backed by an ArrayBuffer (never a SharedArrayBuffer): `applicationServerKey` only
  // accepts the former, and the default Uint8Array type covers both.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** iPadOS reports itself as a Mac, so touch support is what separates it from a desktop Safari. */
export function isIosBrowser(userAgent: string, maxTouchPoints = readMaxTouchPoints()): boolean {
  return (
    userAgent.includes('iPad') ||
    userAgent.includes('iPhone') ||
    userAgent.includes('iPod') ||
    (userAgent.includes('Macintosh') && maxTouchPoints > 1)
  );
}

function readMaxTouchPoints(): number {
  // Node has no navigator during unit tests, and the DOM types insist it always exists.
  const browserNavigator = globalThis.navigator as Navigator | undefined;
  return browserNavigator === undefined ? 0 : browserNavigator.maxTouchPoints;
}
