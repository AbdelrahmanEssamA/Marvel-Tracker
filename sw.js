// Marvel Watch Tracker service worker.
// Bump VERSION whenever you deploy a new index.html so installed copies refresh.
const VERSION = 'v2';
const SHELL_CACHE = 'shell-' + VERSION;
const RUNTIME_CACHE = 'runtime-' + VERSION;
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];
// Poster images and fonts are safe to cache; the TMDB API (it carries the user's key) never is.
const RUNTIME_HOSTS = ['image.tmdb.org', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const MAX_RUNTIME_ENTRIES = 400;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: network first so updates show up, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Own static files: cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }

  // Posters and fonts: stale-while-revalidate.
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async cache => {
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then(res => {
            if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()).then(() => trim(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES)); }
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      })
    );
  }
  // Everything else (including api.themoviedb.org) goes straight to the network.
});
