import type { Schemas } from '@/lib/api/client';

export type StockView = Schemas['StockViewResponse'];
export type ProductWithStock = Schemas['ProductListItemResponse'];
export type InventoryMovement = Schemas['InventoryMovementResponse'];
export type MovementType = Schemas['InventoryMovementType'];

/** Etiquetas de los tipos de movimiento (BR-P4). */
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  COUNT: 'Conteo',
  PURCHASE_IN: 'Ingreso',
  MAINTENANCE_USE: 'Uso en mantenimiento',
  MAINTENANCE_VOID: 'Anulación de mantenimiento',
  ADJUSTMENT: 'Ajuste',
  SALE: 'Venta',
  SALE_VOID: 'Anulación de venta',
};

/** Las cantidades admiten decimales (BR-P15; Decimal(12,3) en la base). */
export const QUANTITY_DECIMALS = 3;

export function formatQuantity(value: number | string): string {
  const number = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString('es-PE', { maximumFractionDigits: QUANTITY_DECIMALS });
}

export function formatSigned(value: number | string): string {
  const number = typeof value === 'string' ? Number(value) : value;
  return `${number > 0 ? '+' : ''}${formatQuantity(number)}`;
}

/** Cantidad escrita por el usuario (acepta coma decimal); null si no es válida. */
export function parseQuantity(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export type StockStatus = 'untracked' | 'not-counted' | 'out' | 'available';

/**
 * - `untracked`: el producto no controla stock (BR-P16).
 * - `not-counted`: sin ningún conteo, el saldo no es confiable (BR-P8).
 * - `out` / `available`: con conteo, saldo ≤ 0 o > 0.
 */
export function stockStatus(
  product: { tracksStock: boolean },
  stock: StockView | undefined,
): StockStatus {
  if (!product.tracksStock) return 'untracked';
  if (!stock || !stock.isCounted) return 'not-counted';
  return stock.balance > 0 ? 'available' : 'out';
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  untracked: 'No controla stock',
  'not-counted': 'Sin conteo inicial',
  out: 'Sin stock',
  available: 'Con stock',
};
