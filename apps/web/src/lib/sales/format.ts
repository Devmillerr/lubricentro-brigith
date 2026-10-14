import type { Schemas } from '@/lib/api/client';
import { dateTimeFormat } from '@/lib/utils';

export type Sale = Schemas['SaleResponse'];
export type SaleLine = Schemas['SaleLineResponse'];
export type SaleSummary = Schemas['SaleSummaryResponse'];
export type SaleSource = Schemas['SaleSource'];
export type SaleStatus = Schemas['SaleStatus'];
export type PaymentMethod = Schemas['PaymentMethod'];

/** De dónde viene la venta (06-API.md §2, "Ventas"). */
export const SOURCE_LABELS: Record<SaleSource, string> = {
  COUNTER: 'Mostrador',
  WASH: 'Lavado',
  MAINTENANCE: 'Mantenimiento',
};

/** Un solo método de pago por venta (DEC-30). */
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  YAPE: 'Yape',
};

export const STATUS_LABELS: Record<SaleStatus, string> = {
  ACTIVE: 'Activa',
  VOIDED: 'Anulada',
};

/** Fuentes que el historial deja filtrar (los cobros de mantenimiento, desde R6). */
export const HISTORY_SOURCES: SaleSource[] = ['COUNTER', 'WASH', 'MAINTENANCE'];

export function isSaleSource(value: string | null): value is SaleSource {
  return value !== null && value in SOURCE_LABELS;
}

/** Máximo del motivo de anulación y de la nota (06-API.md §2, `MAX_SALE_TEXT`). */
export const MAX_SALE_TEXT = 500;

/** Líneas por venta (06-API.md §2, `MAX_SALE_LINES`). */
export const MAX_SALE_LINES = 50;

/**
 * Precio escrito por el usuario (acepta coma decimal): ≥ 0 con hasta 2
 * decimales, como `unitPrice` en `POST /sales` (DEC-29). null si no es válido.
 */
export function parsePrice(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Precio del catálogo para precargar la línea ("12.50"); vacío si el producto no tiene precio. */
export function priceInput(salePrice: string | null): string {
  if (salePrice === null) return '';
  const value = Number(salePrice);
  return Number.isFinite(value) ? value.toFixed(2) : '';
}

/**
 * Subtotal en céntimos: `quantity × unitPrice` redondeado half-up a 2
 * decimales, igual que el servidor (06-API.md §2). Con enteros para no
 * arrastrar el error del float: la cantidad tiene hasta 3 decimales y el
 * precio hasta 2. Es solo la vista previa: el total real lo calcula la API.
 */
export function subtotalCents(quantity: number, unitPrice: number): number {
  const units = Math.round(quantity * 1000) * Math.round(unitPrice * 100); // 1e-5 de sol
  return Math.floor((units + 500) / 1000);
}

export function formatCents(cents: number): string {
  return formatMoney(cents / 100);
}

/**
 * Monto de una venta o lavado. Viaja como string (Decimal) y se muestra en
 * soles con 2 decimales, como los montos confirmados de lavado (S/8, S/15…).
 */
export function formatMoney(amount: string | number): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return Number.isFinite(value) ? `S/ ${value.toFixed(2)}` : `S/ ${amount}`;
}

export const saleDateFormat = dateTimeFormat();

/** Ruta del historial, con el filtro de fuente si lo hay (DEC-68). */
export function salesHistoryHref(source?: SaleSource | null): string {
  return source ? `/ventas?source=${source}` : '/ventas';
}
