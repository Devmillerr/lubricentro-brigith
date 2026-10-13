/**
 * Código del service worker de BRIGITH (04-ARCHITECTURE.md §8, D-10: PWA
 * solo online). Se sirve en `/sw.js` desde `app/sw.js/route.ts` para que lleve
 * la versión de la compilación: cada despliegue cambia el archivo y la app
 * instalada se entera de que hay una versión nueva.
 *
 * Qué hace y qué no:
 * - No usa Cache Storage. Nada de la app ni de la API queda guardado en el
 *   dispositivo, así que cerrar sesión no deja datos privados en cachés y una
 *   versión vieja no puede quedar "pegada".
 * - Sin red, una navegación muestra una pantalla "Sin conexión" generada aquí
 *   mismo (no depende de archivos guardados).
 * - Nunca intercepta la API ni peticiones que no sean navegaciones.
 * - La primera instalación se activa sola. Una actualización espera a que el
 *   usuario toque "Actualizar" (mensaje SKIP_WAITING), para no cambiar de
 *   versión a mitad de una venta.
 */
export function serviceWorkerSource(version: string): string {
  return `// BRIGITH service worker · versión ${JSON.stringify(version)}
'use strict';

const VERSION = ${JSON.stringify(version)};

const OFFLINE_HTML = ${JSON.stringify(OFFLINE_HTML)};

self.addEventListener('install', () => {
  // Primera instalación: activar ya. Si hay una versión activa, esperar.
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Versiones anteriores guardaban /offline en Cache Storage: se borra.
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('brigith-')).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage(VERSION);
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        }),
    ),
  );
});
`;
}

/**
 * Pantalla sin conexión autocontenida: estilos en línea, sin scripts ni
 * archivos externos. "Reintentar" es un enlace a la misma dirección.
 */
const OFFLINE_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1c1a18" media="(prefers-color-scheme: dark)">
<title>Sin conexión · BRIGITH</title>
<style>
:root{color-scheme:light dark;--bg:#f5f3ef;--fg:#1c1b19;--muted:#645e55;--btn:#1c1b19;--btn-fg:#fff;--brand:#d7141e}
@media (prefers-color-scheme:dark){:root{--bg:#121110;--fg:#f2efe9;--muted:#aaa397;--btn:#f2efe9;--btn-fg:#1c1b19}}
*{box-sizing:border-box}
html,body{margin:0;min-height:100dvh;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center;
padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
.brand{font-weight:800;letter-spacing:.12em;font-size:15px;color:var(--brand)}
h1{margin:0;font-size:24px;line-height:1.2}
p{margin:0;max-width:22rem;font-size:16px;line-height:1.5;color:var(--muted)}
a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:12px;background:var(--btn);color:var(--btn-fg);font-weight:600;font-size:16px;text-decoration:none}
a:focus-visible{outline:3px solid var(--brand);outline-offset:3px}
</style>
</head>
<body>
<main>
<span class="brand">BRIGITH</span>
<h1>Sin conexión</h1>
<p>BRIGITH necesita internet para trabajar. Revisa tu conexión e inténtalo de nuevo.</p>
<a href="">Reintentar</a>
</main>
</body>
</html>`;
