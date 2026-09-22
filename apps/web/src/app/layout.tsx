import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ConnectivityProvider, OfflineBanner } from '@/lib/connectivity';
import { RegisterServiceWorker } from './register-sw';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brigith OS',
  description: 'Registro de clientes, vehículos y mantenimientos del lubricentro.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
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
