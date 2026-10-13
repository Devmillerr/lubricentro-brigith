// Post-build del export estático: genera out/_headers y out/_redirects
// (formato de Cloudflare static assets). Lo llama scripts/build-static.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { manifestHeaders, securityHeaders, swHeaders } from '../security-headers.mjs';

const out = path.resolve(import.meta.dirname, '../out');
// Límite de Cloudflare para reglas dinámicas (con `:param` o `*`) en _redirects.
const MAX_DYNAMIC_REDIRECTS = 100;

const block = (route, headers) =>
  `${route}\n${headers.map((h) => `  ${h.key}: ${h.value}`).join('\n')}\n`;

fs.writeFileSync(
  path.join(out, '_headers'),
  [
    block('/*', [
      ...securityHeaders({ apiUrl: process.env.NEXT_PUBLIC_API_URL, isProduction: true }),
      // Vercel la añadía solo; Cloudflare no, salvo que se active en la zona.
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ]),
    block('/sw.js', swHeaders),
    block('/manifest.webmanifest', manifestHeaders),
    // Archivos con hash en el nombre: caché larga. Son públicos (código de la app, sin datos).
    block('/_next/static/*', [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]),
  ].join('\n'),
);

// Rutas [id]: se exportan una sola vez con el id comodín "_" (src/lib/static-route)
// y aquí se reescribe /x/<id> → /x/_. Se deducen de los .html de out/.
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const pages = walk(out)
  .filter((f) => f.endsWith('.html'))
  .map(
    (f) =>
      '/' +
      path
        .relative(out, f)
        .split(path.sep)
        .join('/')
        .replace(/\.html$/, ''),
  );
const isWildcard = (p) => p.split('/').includes('_');

const dynamic = pages
  .filter(isWildcard)
  .map((p) => ({
    from: p
      .split('/')
      .map((s) => (s === '_' ? ':id' : s))
      .join('/'),
    to: p,
  }))
  // Las rutas más largas primero: /clientes/:id/editar antes que /clientes/:id.
  .sort((a, b) => b.from.split('/').length - a.from.split('/').length);
const matches = (from, p) => new RegExp('^' + from.replace(/:id/g, '[^/]+') + '$').test(p);
// Rutas estáticas que una regla dinámica capturaría (p. ej. /clientes/nuevo frente a
// /clientes/:id): se sirven a sí mismas y van antes.
const shadowed = pages.filter((p) => !isWildcard(p) && dynamic.some((d) => matches(d.from, p)));

// Por cada ruta: el árbol RSC que Next pide al navegar (`__next.*` y `.txt`) y la página.
const rules = (from, to) => [
  `${from}/__next.* ${to}/__next.:splat 200`,
  `${from}.txt ${to}.txt 200`,
  `${from} ${to} 200`,
];
const lines = [
  ...shadowed.flatMap((p) => rules(p, p)),
  ...dynamic.flatMap((d) => rules(d.from, d.to)),
];
const dynamicCount = lines.filter((l) => /[:*]/.test(l.split(' ')[0])).length;
if (dynamicCount > MAX_DYNAMIC_REDIRECTS) {
  console.error(`_redirects: ${dynamicCount} reglas dinámicas (máximo ${MAX_DYNAMIC_REDIRECTS}).`);
  process.exit(1);
}
fs.writeFileSync(
  path.join(out, '_redirects'),
  ['# Generado por scripts/write-cf-static-files.mjs', ...lines].join('\n') + '\n',
);
console.log(
  `_headers y _redirects: ${dynamic.length} rutas [id], ${shadowed.length} estáticas protegidas, ` +
    `${dynamicCount}/${MAX_DYNAMIC_REDIRECTS} reglas dinámicas.`,
);
