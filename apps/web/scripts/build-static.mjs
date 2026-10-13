// Build de la web como sitio estático para Cloudflare (`pnpm build:static`):
// `next build` con STATIC_EXPORT=1 (output: 'export' → out/) y luego
// out/_headers y out/_redirects (write-cf-static-files.mjs). Es un script de
// Node y no `STATIC_EXPORT=1 next build` para que funcione igual en Windows.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (!process.env.NEXT_PUBLIC_API_URL) {
  // Sin ella la web apuntaría a localhost y la CSP (connect-src) bloquearía la API real.
  console.error('Falta NEXT_PUBLIC_API_URL (p. ej. https://<sitio>.netlify.app/api/v1).');
  process.exit(1);
}

const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const build = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, STATIC_EXPORT: '1' },
});
if (build.status !== 0) process.exit(build.status ?? 1);

await import('./write-cf-static-files.mjs');
