import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import type { ReactNode } from 'react';
import { preconnect } from 'react-dom';
import { ConnectivityProvider, OfflineBanner } from '@/lib/connectivity';
import { RegisterServiceWorker } from './register-sw';
import './globals.css';

// Tipografía (next/font: se sirve desde la propia app, sin pedidos a Google).
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

// El manifiesto sale de app/manifest.ts (Next agrega el <link> solo).
export const metadata: Metadata = {
  title: 'BRIGITH',
  applicationName: 'BRIGITH',
  description:
    'Ventas, lavados, mantenimientos, inventario, compras y clientes del lubricentro BRIGITH.',
  // iPhone/iPad: "Añadir a pantalla de inicio" abre a pantalla completa con
  // este nombre; la barra de estado sigue el color del header.
  appleWebApp: { capable: true, title: 'BRIGITH', statusBarStyle: 'default' },
  // Safari no convierte placas, RUC ni montos en enlaces de llamada.
  formatDetection: { telephone: false, email: false, address: false },
  // Next solo emite `mobile-web-app-capable`; iOS anteriores a 16.4 leen esta.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom impide ampliar a quien lo necesita (WCAG 1.4.4).
  // Los inputs miden 16 px, así que iOS no hace zoom automático al enfocarlos.
  viewportFit: 'cover',
  // Igual que el header de la app en cada tema.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a18' },
  ],
};

/** Origen de la API (otro dominio): se abre la conexión antes de que la app la pida. */
function apiOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin;
  } catch {
    return null;
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // Toda pantalla con sesión empieza con `/auth/me` contra la API: precalentar
  // DNS + TCP + TLS ahorra un viaje de red en móvil. Sin `crossOrigin` porque
  // el cliente usa `credentials: 'include'` (conexión con credenciales).
  const api = apiOrigin();
  if (api) preconnect(api);
  return (
    <html lang="es" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh">
        <ConnectivityProvider>
          <RegisterServiceWorker />
          <OfflineBanner />
          {children}
        </ConnectivityProvider>
      </body>
    </html>
  );
}
