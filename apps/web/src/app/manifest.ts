import type { MetadataRoute } from 'next';

// Export estático: el manifiesto se genera en la compilación.
export const dynamic = 'force-static';

/**
 * Manifiesto de la PWA (se sirve en `/manifest.webmanifest` y Next agrega el
 * `<link rel="manifest">`). `id` fijo: la app instalada se reconoce aunque
 * cambie `start_url`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'BRIGITH',
    short_name: 'BRIGITH',
    description:
      'Ventas, lavados, mantenimientos, inventario, compras y clientes del lubricentro BRIGITH.',
    lang: 'es-PE',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f3ef',
    theme_color: '#ffffff',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
