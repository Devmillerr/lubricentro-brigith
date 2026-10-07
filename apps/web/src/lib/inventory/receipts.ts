import { api, type Schemas } from '@/lib/api/client';
import { callApi, type ApiResult } from '@/lib/api/request';
import { findProduct } from '@/lib/products/product-lookup';
import type { Product } from '@/lib/products/format';
import { parseQuantity, QUANTITY_DECIMALS, type ProductWithStock } from './format';
import { dateTimeFormat } from '@/lib/utils';

export type InventoryReceipt = Schemas['InventoryReceiptResponse'];
export type InventoryReceiptSummary = Schemas['InventoryReceiptSummaryResponse'];

/** Límites del contrato de `POST /inventory/receipts` (06-API.md §2, cambios de R3). */
export const MAX_RECEIPT_LINES = 100;
export const MAX_RECEIPT_NOTE = 500;
/** Decimal(12,3) en la base: la parte entera admite hasta 9 dígitos. */
export const MAX_RECEIPT_QUANTITY = 999_999_999.999;

export const receiptDateFormat = dateTimeFormat();

/** Mes actual `YYYY-MM` en la hora de Lima (la zona del negocio, DEC-79). */
export function currentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')!.value;
  const month = parts.find((part) => part.type === 'month')!.value;
  return `${year}-${month}`;
}

/** Suma o resta meses a `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "octubre de 2026". */
export function monthLabel(month: string): string {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('es-PE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, value - 1, 15)));
}

export function productCountLabel(count: number): string {
  return count === 1 ? '1 producto' : `${count} productos`;
}

/**
 * Suma `step` a una cantidad escrita (botones −/+). Conserva los decimales,
 * redondea a 3 y nunca llega a 0: para sacar la línea está "Quitar".
 * Si lo escrito no es válido, parte de 1.
 */
export function stepQuantity(raw: string, step: number): string {
  const current = parseQuantity(raw);
  if (current === null) return '1';
  const factor = 10 ** QUANTITY_DECIMALS;
  const next = Math.round((current + step) * factor) / factor;
  return next > 0 ? String(next) : raw;
}

/**
 * Nombres de los productos de una recepción. Las líneas solo traen el
 * `productId` y la API no tiene `GET /products/{id}`: se buscan con
 * `findProduct`, que guarda cada página que recorre, así que las líneas
 * siguientes suelen salir de la memoria. Se piden de a una para no recorrer
 * el catálogo varias veces en paralelo. Un producto que no se encuentra no
 * impide ver la recepción.
 */
export async function loadReceiptProducts(
  productIds: string[],
): Promise<ApiResult<Map<string, Product>>> {
  const products = new Map<string, Product>();
  for (const id of productIds) {
    const result = await findProduct(id);
    if (result.ok) products.set(id, result.data);
    else if (result.failure.status !== 404) return result;
  }
  return { ok: true, data: products };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Producto para arrancar Recibir desde "Ingreso" (`?producto=`), con su saldo
 * si controla stock, para mostrarlo en la línea. Un id mal formado se trata
 * como inexistente sin recorrer el catálogo.
 */
export async function loadProductToReceive(id: string): Promise<ApiResult<ProductWithStock>> {
  const product = UUID.test(id) ? await findProduct(id) : null;
  if (!product || !product.ok) {
    return (
      product ?? {
        ok: false,
        failure: {
          status: 404,
          code: 'PRODUCT_NOT_FOUND',
          fieldErrors: {},
          classified: {
            kind: 'client',
            code: 'PRODUCT_NOT_FOUND',
            detail: 'Producto no encontrado',
          },
        },
      }
    );
  }
  const withStock = product.data as ProductWithStock;
  // El saldo se pide siempre: el que guarda `findProduct` puede ser de antes de un conteo.
  if (!withStock.tracksStock) return { ok: true, data: withStock };
  const stock = await callApi(
    api.GET('/inventory/stock', { params: { query: { productId: id } } }),
  );
  // Sin saldo la línea se muestra igual: no impide recibir.
  return { ok: true, data: stock.ok ? { ...withStock, stock: stock.data } : withStock };
}
