import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import type { ReactNode } from 'react';
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

export const metadata: Metadata = {
  title: 'Brigith',
  description: 'Registro de clientes, vehículos y mantenimientos del lubricentro.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  // Igual que el header de la app en cada tema.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a18' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
