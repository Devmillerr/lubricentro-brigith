import type { NextConfig } from 'next';
import { manifestHeaders, securityHeaders, swHeaders } from './security-headers.mjs';

const isProduction = process.env.NODE_ENV === 'production';
const isStaticExport = process.env.STATIC_EXPORT === '1';

const appVersion =
  (
    process.env.WORKERS_CI_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA
  )?.slice(0, 12) ?? `local-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  ...(isStaticExport
    ? {
        // Export estático: Next no sirve cabeceras; van en out/_headers (scripts/write-cf-static-files.mjs).
        output: 'export' as const,
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: securityHeaders({ apiUrl: process.env.NEXT_PUBLIC_API_URL, isProduction }),
            },
            { source: '/sw.js', headers: swHeaders },
            { source: '/manifest.webmanifest', headers: manifestHeaders },
          ];
        },
      }),
};

export default nextConfig;
