// Service worker mínimo de Brigith (04-ARCHITECTURE.md §8).
// Solo cachea la carcasa de la app para poder mostrar /offline sin red.
// A propósito NO cachea datos de negocio ni respuestas de /api/*.

const SHELL_CACHE = 'brigith-shell-v1';
const OFFLINE_URL = '/offline';
const SHELL_URLS = [OFFLINE_URL];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Nunca intervenir peticiones a la API: los datos de negocio no se cachean.
  if (request.url.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((res) => res ?? Response.error())),
    );
  }
});
