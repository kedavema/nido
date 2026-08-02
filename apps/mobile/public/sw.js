/*
 * Nido service worker — Web Push only.
 *
 * It lives in `public/` because the Expo static export copies that directory verbatim to the site
 * root, and a service worker can only control pages at or below its own path. Served from `/sw.js`
 * it covers the whole app; served from a hashed bundle path it would control nothing.
 *
 * Plain JavaScript on purpose: this file is shipped as-is, never bundled or transpiled.
 */

const DEFAULT_TITLE = 'Nido';
const NOTIFICATION_TAG = 'nido-occurrence-due';

self.addEventListener('install', () => {
  // Take over immediately instead of waiting for every existing tab to close. A stale worker
  // would keep handling pushes with old code after an update.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Only the three fields the API sends: title, body and occurrenceId. Anything else would mean
  // the payload started carrying data it should not.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const occurrenceId = typeof payload.occurrenceId === 'string' ? payload.occurrenceId : null;

  event.waitUntil(
    self.registration.showNotification(payload.title || DEFAULT_TITLE, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // A single tag so several reminders arriving together replace each other instead of
      // stacking into a wall of notifications.
      tag: NOTIFICATION_TAG,
      data: { occurrenceId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const occurrenceId = event.notification.data && event.notification.data.occurrenceId;
  const target = occurrenceId ? `/pagar-fijo/${occurrenceId}` : '/fijos';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Reuse an open tab when there is one: opening a second copy of an installed PWA is
      // disorienting, and the running app already holds the session.
      for (const client of clientList) {
        if ('focus' in client && 'navigate' in client) {
          return client.focus().then(() => client.navigate(target));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
