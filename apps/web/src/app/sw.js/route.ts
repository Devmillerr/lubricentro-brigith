import { serviceWorkerSource } from '@/lib/pwa/service-worker-source';

// Se genera una vez por compilación, con la versión de ese build.
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(serviceWorkerSource(process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
