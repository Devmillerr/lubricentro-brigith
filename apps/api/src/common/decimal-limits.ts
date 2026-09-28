/**
 * Topes técnicos de las columnas `Decimal` de Postgres (schema.prisma), para
 * que un valor que no cabe responda 400 `VALIDATION_ERROR` en vez de terminar
 * en un 500 al escribir. No son reglas de negocio.
 */

/** Montos: `Decimal(10,2)` (precios, subtotales, totales, cobros). */
export const MAX_MONEY = 99_999_999.99;

/** Cantidades y saldos de producto: `Decimal(12,3)`. */
export const MAX_QUANTITY = 999_999_999.999;

export const MAX_MONEY_MESSAGE = 'El monto es demasiado grande (máximo 99 999 999,99).';
export const MAX_QUANTITY_MESSAGE = 'La cantidad es demasiado grande (máximo 999 999 999,999).';
