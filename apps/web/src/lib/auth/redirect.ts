export const HOME_PATH = '/dashboard';

/**
 * Destino tras iniciar sesión (`/login?next=...`). Solo rutas internas: evita
 * redirigir a otro sitio con un enlace manipulado (`//evil.com`, `https://...`).
 */
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return HOME_PATH;
  }
  if (raw === '/login' || raw.startsWith('/login?')) return HOME_PATH;
  return raw;
}

export function loginPathFor(currentPath: string): string {
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
