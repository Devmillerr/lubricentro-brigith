'use client';

import { useEffect } from 'react';

/**
 * Título de la pestaña del navegador según la pantalla ("Ventas · Brigith"),
 * para que el historial, las pestañas y los lectores de pantalla distingan
 * una pantalla de otra. Las pantallas son de cliente, así que no usan
 * `metadata` de Next.
 */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · Brigith`;
  }, [title]);
  return null;
}
