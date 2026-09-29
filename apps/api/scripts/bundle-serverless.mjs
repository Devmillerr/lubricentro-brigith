// Empaqueta la API como función de Vercel en `dist/serverless.cjs`.
//
// NestJS 12 es solo ESM y la API compila a CommonJS: Node 22 local carga ESM
// con `require()`, pero el runtime de funciones de Vercel no. Este bundle mete
// todo el código ESM (Nest y sus dependencias) en un único archivo CommonJS y
// deja fuera solo paquetes CommonJS: nativos (argon2), Prisma y pg, y los que
// Nest carga por nombre en tiempo de ejecución, que deben ser una sola copia
// (class-validator, class-transformer, reflect-metadata). Swagger UI no se
// monta en producción (`app.factory.ts`), así que `swagger-ui-dist` no hace falta.
//
// Parte de `dist/src/serverless.js` (salida de `nest build`), no del .ts: tsc
// emite la metadata de decoradores (`emitDecoratorMetadata`) que la inyección
// de dependencias de Nest necesita y que esbuild no genera.
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const external = [
  'argon2',
  '@prisma/client',
  '.prisma/client',
  '@prisma/adapter-pg',
  'pg',
  'class-validator',
  'class-transformer',
  'swagger-ui-dist',
  'reflect-metadata',
  // Opcionales de Nest que Brigith no usa: se intentan cargar y se ignoran.
  '@nestjs/microservices',
  '@nestjs/websockets',
  '@nestjs/platform-socket.io',
  '@fastify/static',
  '@nestjs/platform-fastify',
];

await build({
  entryPoints: ['dist/src/serverless.js'],
  outfile: 'dist/serverless.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external,
  // El código ESM usa `import.meta.url` (p. ej. `createRequire`); en CommonJS
  // se reemplaza por la URL del propio bundle.
  define: { 'import.meta.url': '__bundle_url' },
  banner: { js: "const __bundle_url = require('node:url').pathToFileURL(__filename).href;" },
  keepNames: true,
  logLevel: 'warning',
});
// Vercel exige un directorio de salida estático aunque solo haya funciones.
mkdirSync('dist/static', { recursive: true });
console.log('Bundle serverless escrito en dist/serverless.cjs');
