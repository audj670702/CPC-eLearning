const CPC_SW_VERSION = 'cpc-v0.3.8';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Se mantiene network-first sin cachear navegación ni OAuth.
// Su función principal aquí es establecer correctamente la PWA instalable.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
