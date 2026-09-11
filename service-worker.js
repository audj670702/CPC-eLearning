const CACHE_NAME = 'cpc-elearning-v0.4.4-mns-v0.5.5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function unavailableResponse() {
  return new Response('Recurso temporalmente no disponible.', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') return;

  const isNavigation =
    event.request.mode === 'navigate' ||
    requestUrl.pathname.endsWith('/') ||
    requestUrl.pathname.endsWith('/index.html');

  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME)
                .then((cache) => cache.put('./index.html', copy))
                .catch(() => undefined)
            );
          }
          return response;
        })
        .catch(async () =>
          (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          unavailableResponse()
        )
    );
    return;
  }

  if (event.request.headers.has('range')) {
    event.respondWith(
      fetch(event.request).catch(() => unavailableResponse())
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (
          response &&
          response.status === 200 &&
          response.type !== 'opaque' &&
          requestUrl.origin === self.location.origin
        ) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => undefined)
          );
        }
        return response;
      } catch {
        return unavailableResponse();
      }
    })
  );
});
