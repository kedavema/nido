/*
 * Nido service worker — Web Push and offline shell.
 *
 * It lives in `public/` because the Expo static export copies that directory verbatim to the site
 * root, and a service worker can only control pages at or below its own path. Served from `/sw.js`
 * it covers the whole app; served from a hashed bundle path it would control nothing.
 *
 * Plain JavaScript on purpose: this file is shipped as-is, never bundled or transpiled.
 */

const DEFAULT_TITLE = 'Nido';
const NOTIFICATION_TAG = 'nido-occurrence-due';

/*
 * Bump this to invalidate everything the previous worker stored. The name is the whole cache
 * invalidation strategy: `activate` deletes every cache whose name is not this one.
 */
const CACHE_NAME = 'nido-shell-v1';

/*
 * The only URLs whose paths are known ahead of time. Everything else Expo emits carries a content
 * hash in its name, so it cannot be listed here and is cached as it is requested instead.
 *
 * `/` is what makes the app open offline at all: the export writes a real document per route, but
 * expo-router hydrates and takes over routing on the client, so the index document can answer a
 * navigation to any route.
 */
const PRECACHED_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  // Take over immediately instead of waiting for every existing tab to close. A stale worker
  // would keep handling pushes with old code after an update.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individually rather than `addAll`, which rejects the whole batch if a single URL 404s and
      // would leave the install with no cache at all over one missing icon.
      Promise.all(
        PRECACHED_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

/*
 * Never cached, under any strategy. `/api` is the proxy to the live backend, and a stale balance
 * or a replayed write is worse than an error message — the app already has its own offline queue
 * and cache for financial data, which know how to label what they show as stale.
 */
function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

/* Content-hashed bundles and assets: the name changes when the bytes do, so a hit is never stale. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_expo/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only GET is safe to serve from or write to a cache; a POST replayed from storage would be a
  // duplicated write.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  // Cross-origin requests (push services, Firebase, Google fonts) are left to the network. Caching
  // another origin's opaque responses fills the quota with bytes we cannot inspect or validate.
  if (url.origin !== self.location.origin || isApiRequest(url)) {
    return;
  }

  if (request.mode === 'navigate') {
    // Network-first: a navigation is the one moment the user expects the freshest app. The cached
    // index is the fallback that makes an offline launch work at all.
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    // Cache-first: these URLs are immutable by construction, so going to the network on a hit
    // would spend latency to re-download bytes that cannot have changed.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            cachePut(request, response);
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else — the manifest, icons, fonts served from our own origin — is fresh when the
  // network answers and cached otherwise.
  event.respondWith(
    fetch(request)
      .then((response) => {
        cachePut(request, response);
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

function cachePut(request, response) {
  // `response.ok` excludes 404s and 5xx; `type === 'basic'` excludes opaque cross-origin bodies,
  // whose status is not even readable. A response can only be read once, so the cache gets a clone.
  if (!response || !response.ok || response.type !== 'basic') {
    return;
  }
  const copy = response.clone();
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => undefined);
}

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
