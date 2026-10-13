// Tipos de security-headers.mjs (JS para que también lo use scripts/write-cf-static-files.mjs).
export type Header = { key: string; value: string };
export type SecurityHeaderOptions = { apiUrl: string | undefined; isProduction: boolean };

export function contentSecurityPolicy(opts: SecurityHeaderOptions): string;
export function securityHeaders(opts: SecurityHeaderOptions): Header[];
export const swHeaders: Header[];
export const manifestHeaders: Header[];
