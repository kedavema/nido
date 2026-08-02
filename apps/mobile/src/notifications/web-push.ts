import type { RegisterDeviceRequest } from '@nido/contracts';
import { Platform } from 'react-native';

import {
  decodeVapidPublicKey,
  isIosBrowser,
  resolveWebPushState,
  type WebPushState,
} from './web-push-state';

const SERVICE_WORKER_PATH = '/sw.js';

/** Reads the current browser state. Returns `unsupported` on native without touching web APIs. */
export async function readWebPushState(): Promise<WebPushState> {
  if (Platform.OS !== 'web') {
    return { kind: 'unsupported' };
  }

  const hasServiceWorker = 'serviceWorker' in navigator;
  const registration = hasServiceWorker
    ? await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH)
    : undefined;

  return resolveWebPushState({
    isSecureContext: globalThis.isSecureContext,
    hasServiceWorker,
    hasPushManager: 'PushManager' in globalThis,
    hasNotification: 'Notification' in globalThis,
    permission: 'Notification' in globalThis ? Notification.permission : null,
    isIos: isIosBrowser(navigator.userAgent),
    isStandalone: isStandaloneDisplay(),
    hasSubscription: (await registration?.pushManager.getSubscription()) != null,
  });
}

/**
 * Subscribes this browser and returns the registration payload for the API.
 *
 * Must be called from a user gesture: Safari refuses `Notification.requestPermission()` outside
 * one, and Chrome degrades the prompt. That is why this is a function the screen's button calls,
 * not something that runs on mount.
 */
export async function subscribeToWebPush(
  installationId: string,
  vapidPublicKey: string,
): Promise<RegisterDeviceRequest | null> {
  if (Platform.OS !== 'web' || !('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }

  const subscription = await registration.pushManager.subscribe({
    // Required by every current browser: a subscription that can be used silently is not allowed.
    userVisibleOnly: true,
    applicationServerKey: decodeVapidPublicKey(vapidPublicKey),
  });

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (json.endpoint === undefined || p256dh === undefined || auth === undefined) {
    return null;
  }

  return {
    installationId,
    platform: 'WEB',
    credential: { kind: 'WEB_PUSH', endpoint: json.endpoint, keys: { p256dh, auth } },
  };
}

/** Drops the browser subscription so the push service stops accepting messages for it. */
export async function unsubscribeFromWebPush(): Promise<void> {
  if (Platform.OS !== 'web' || !('serviceWorker' in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

function isStandaloneDisplay(): boolean {
  // `navigator.standalone` is the iOS-only signal for "launched from the Home Screen"; every other
  // browser answers through the display-mode media query.
  const iosStandalone = (globalThis.navigator as { standalone?: boolean }).standalone;
  return iosStandalone ?? globalThis.matchMedia('(display-mode: standalone)').matches;
}
