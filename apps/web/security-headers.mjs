// Cabeceras de seguridad compartidas: next.config.ts (servidor Next) y
// scripts/write-cf-static-files.mjs (_headers de Cloudflare para el export estático).
function apiOrigin(apiUrl) {
  try {
    return new URL(apiUrl ?? 'http://localhost:4000/api/v1').origin;
  } catch {
    return '';
  }
}
export function contentSecurityPolicy({ apiUrl, isProduction }) {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", apiOrigin(apiUrl), ...(isProduction ? [] : ['ws:', 'wss:'])].filter(
      Boolean,
    ),
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([n, v]) => `${n} ${v.join(' ')}`)
    .join('; ');
}
export function securityHeaders(opts) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(opts) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
}
export const swHeaders = [
  { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
  { key: 'Service-Worker-Allowed', value: '/' },
];
export const manifestHeaders = [{ key: 'Cache-Control', value: 'no-cache' }];
