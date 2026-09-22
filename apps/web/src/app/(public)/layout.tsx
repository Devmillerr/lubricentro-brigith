import type { ReactNode } from 'react';

/** Pantallas sin sesión (inicio de sesión, sin conexión): columna angosta centrada. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">{children}</main>;
}
