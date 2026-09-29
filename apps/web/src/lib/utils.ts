import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Fecha y hora cortas en es-PE ("28 set. 2026, 5:40 p. m."). La hora no se
 * parte entre dos líneas: sus espacios pasan a ser no separables.
 */
export function dateTimeFormat(): { format: (date: Date) => string } {
  const intl = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  return {
    format: (date) =>
      intl.format(date).replace(/(\d{1,2}:\d{2})\s+([ap]\.)\s*(m\.)/g, '$1\u00a0$2\u00a0$3'),
  };
}
