import { HttpStatus } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
} from '../common/exceptions/problem.exception';
import type { ScopedTransaction } from '../prisma/business-scope';

/** Margen para el reloj del dispositivo: una recepción puede venir hasta 5 min "adelantada" (DEC-96). */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Ventana de búsqueda de una recepción parecida, sin comprobante (DEC-96): ±3 días. */
export const DUPLICATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export type LaterStockResolution = 'ADD_TO_STOCK' | 'SET_PHYSICAL';

export interface LaterStockChoice {
  productId: string;
  resolution: LaterStockResolution;
  /** Solo con `SET_PHYSICAL`: lo que hay hoy en el estante, escrito por el usuario. */
  physicalQuantity?: number;
}

/** Conteo o ajuste con fecha igual o posterior a la recepción, que pudo incluir lo recibido. */
export interface LaterStockCheck {
  movementId: string;
  type: 'COUNT' | 'ADJUSTMENT';
  occurredAt: string;
  countedQuantity: string | null;
}

export interface LaterStockProduct {
  productId: string;
  name: string;
  unit: string;
  balance: string;
  checks: LaterStockCheck[];
}

/** Lo que se guarda en `InventoryReceipt.laterStockResolution` (auditoría). */
export interface LaterStockResolutionRecord {
  productId: string;
  resolution: LaterStockResolution;
  physicalQuantity: string | null;
  checks: LaterStockCheck[];
}

/** Rechaza una fecha de recepción futura (DEC-96, BR-K2). */
export function assertReceiptNotInFuture(occurredAt: Date, now: Date): void {
  if (occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw new ValidationProblemException([
      { field: 'occurredAt', message: 'La fecha de recepción no puede ser futura.' },
    ]);
  }
}

/**
 * Forma de `laterStockChecks` (antes de abrir la transacción): sin productos
 * repetidos, solo productos de la recepción y `physicalQuantity` exactamente
 * cuando la resolución es `SET_PHYSICAL`.
 */
export function validateLaterStockChoices(
  choices: LaterStockChoice[] | undefined,
  lineProductIds: string[],
): void {
  if (!choices) return;
  const lines = new Set(lineProductIds);
  const seen = new Set<string>();
  const errors: { field: string; message: string }[] = [];
  choices.forEach((choice, index) => {
    const field = `laterStockChecks.${index}`;
    if (!lines.has(choice.productId)) {
      errors.push({ field: `${field}.productId`, message: 'El producto no está en la recepción.' });
    }
    if (seen.has(choice.productId)) {
      errors.push({ field: `${field}.productId`, message: 'Producto repetido.' });
    }
    seen.add(choice.productId);
    if (choice.resolution === 'SET_PHYSICAL' && choice.physicalQuantity === undefined) {
      errors.push({
        field: `${field}.physicalQuantity`,
        message: 'Escribe la cantidad que hay hoy en el estante.',
      });
    }
    if (choice.resolution === 'ADD_TO_STOCK' && choice.physicalQuantity !== undefined) {
      errors.push({
        field: `${field}.physicalQuantity`,
        message: 'La cantidad del estante solo se indica al fijar la cantidad física.',
      });
    }
  });
  if (errors.length > 0) throw new ValidationProblemException(errors);
}

/**
 * Conteos y ajustes de los productos con fecha igual o posterior a la
 * recepción (DEC-96). Debe llamarse con los productos ya bloqueados: así
 * ningún conteo nuevo entra entre esta lectura y la escritura.
 */
export async function findLaterStockChecks(
  tx: ScopedTransaction,
  productIds: string[],
  occurredAt: Date,
): Promise<LaterStockProduct[]> {
  const movements = await tx.inventoryMovement.findMany({
    where: {
      productId: { in: productIds },
      type: { in: [InventoryMovementType.COUNT, InventoryMovementType.ADJUSTMENT] },
      occurredAt: { gte: occurredAt },
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
  if (movements.length === 0) return [];
  const products = await tx.product.findMany({
    where: { id: { in: [...new Set(movements.map((m) => m.productId))] } },
    select: { id: true, name: true, unit: true, stockQuantity: true },
  });
  return products
    .map((product) => ({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      balance: new Prisma.Decimal(product.stockQuantity).toString(),
      checks: movements
        .filter((m) => m.productId === product.id)
        .map((m) => ({
          movementId: m.id,
          type: m.type as 'COUNT' | 'ADJUSTMENT',
          occurredAt: m.occurredAt.toISOString(),
          countedQuantity: m.countedQuantity?.toString() ?? null,
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Exige una resolución para exactamente los productos detectados (DEC-96).
 * Sin resolución: 409 `LATER_STOCK_CHECKS_FOUND`. Con una que no coincide
 * (falta un producto, sobra uno o apareció un conteo nuevo): 409
 * `LATER_STOCK_CHECKS_MISMATCH`. Nada se escribe en ningún caso.
 */
export function resolveLaterStockChecks(
  found: LaterStockProduct[],
  choices: LaterStockChoice[] | undefined,
): LaterStockResolutionRecord[] {
  if (found.length === 0 && (!choices || choices.length === 0)) return [];
  if (found.length > 0 && (!choices || choices.length === 0)) {
    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'LATER_STOCK_CHECKS_FOUND',
      title: 'Hay conteos o ajustes posteriores a esta recepción',
      detail:
        'Después de la fecha de esta recepción se contó o ajustó el stock de algunos productos. Indica, por producto, si la mercadería ya estaba en ese conteo.',
      data: { products: found },
    });
  }
  const chosen = new Map((choices ?? []).map((c) => [c.productId, c]));
  const detected = new Set(found.map((p) => p.productId));
  const sameSet =
    chosen.size === detected.size && [...detected].every((productId) => chosen.has(productId));
  if (!sameSet) {
    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'LATER_STOCK_CHECKS_MISMATCH',
      title: 'Las indicaciones no coinciden con los conteos posteriores',
      detail:
        'Revisa la lista de productos con conteos o ajustes posteriores y vuelve a indicar qué hacer con cada uno.',
      data: { products: found },
    });
  }
  return found.map((product) => {
    const choice = chosen.get(product.productId)!;
    return {
      productId: product.productId,
      resolution: choice.resolution,
      physicalQuantity:
        choice.physicalQuantity === undefined ? null : String(choice.physicalQuantity),
      checks: product.checks,
    };
  });
}

/**
 * Recepción no anulada muy parecida a la que se registra (DEC-96): mismo
 * proveedor (o ninguno en ambas), mismos productos y cantidades, a ±3 días.
 * Con los productos bloqueados, una recepción simultánea igual ya confirmada
 * se ve aquí. Devuelve la más reciente o `null`.
 */
export async function findPossibleDuplicateReceipt(
  tx: ScopedTransaction,
  params: {
    receiptRefType: string;
    occurredAt: Date;
    supplierId: string | null;
    lines: { productId: string; quantity: number }[];
  },
): Promise<{ id: string; occurredAt: Date; createdAt: Date } | null> {
  const from = new Date(params.occurredAt.getTime() - DUPLICATE_WINDOW_MS);
  const to = new Date(params.occurredAt.getTime() + DUPLICATE_WINDOW_MS);
  const candidates = await tx.inventoryReceipt.findMany({
    where: { occurredAt: { gte: from, lte: to }, supplierId: params.supplierId, voidedAt: null },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    select: { id: true, occurredAt: true, createdAt: true },
  });
  if (candidates.length === 0) return null;
  const movements = await tx.inventoryMovement.findMany({
    where: {
      refType: params.receiptRefType,
      refId: { in: candidates.map((c) => c.id) },
      type: InventoryMovementType.PURCHASE_IN,
    },
    select: { refId: true, productId: true, quantityDelta: true },
  });
  const wanted = lineSignature(
    params.lines.map((l) => ({
      productId: l.productId,
      quantity: new Prisma.Decimal(String(l.quantity)),
    })),
  );
  for (const candidate of candidates) {
    const own = movements
      .filter((m) => m.refId === candidate.id)
      .map((m) => ({ productId: m.productId, quantity: new Prisma.Decimal(m.quantityDelta) }));
    if (own.length > 0 && lineSignature(own) === wanted) return candidate;
  }
  return null;
}

function lineSignature(lines: { productId: string; quantity: Prisma.Decimal }[]): string {
  return lines
    .map((l) => `${l.productId}:${l.quantity.toFixed(3)}`)
    .sort()
    .join('|');
}
