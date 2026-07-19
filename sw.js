/* Atlas service worker — network-first with offline fallback.
   ----------------------------------------------------------------
   Strategy:
   - On fetch: try the network first. If it succeeds, cache the fresh
     copy and serve it. If the network fails (offline), serve the last
     cached copy so the app still works on a plane / in a dead zone.
   - CACHE_VERSION is bumped whenever we want to guarantee a hard refresh.
     Changing it causes old caches to be deleted on activate.
   This means: update index.html on GitHub -> open the app -> it self-updates.
*/

const CACHE_VERSION = 'atlas-v16';
const CORE_ASSETS = ['./', './index.html'];

// Install: pre-cache the core shell, then activate immediately.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

// Activate: clean up any old caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first, fall back to cache when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests; let everything else pass through.
  if (req.method !== 'GET') return;

  // For navigation/document requests and same-origin assets, use network-first.
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache a fresh copy for offline use.
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          // Offline: serve cached copy, or the cached index as a last resort.
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
  }
  // Cross-origin requests (fonts, QR lib, exchange-rate API) fall through to the
  // network normally — we don't want to cache or block those.
});

// Allow the page to tell the SW to activate a waiting version immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
