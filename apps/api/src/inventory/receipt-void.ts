import { HttpStatus } from '@nestjs/common';
import { InventoryMovementType, Prisma, type InventoryMovement } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import type { ScopedTransaction } from '../prisma/business-scope';

/**
 * Movimientos que, registrados después de una recepción, impiden anularla
 * (R8, DEC-97, D25): consumen o fijan el stock que la recepción sumó.
 */
export const LATER_BLOCKING_TYPES: InventoryMovementType[] = [
  InventoryMovementType.SALE,
  InventoryMovementType.MAINTENANCE_USE,
  InventoryMovementType.COUNT,
  InventoryMovementType.ADJUSTMENT,
];

/** Bloquea la cabecera de la recepción del negocio (`FOR UPDATE`). */
export async function lockReceipt(
  tx: ScopedTransaction,
  businessId: string,
  receiptId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "inventory_receipts" WHERE "businessId" = ${businessId}::text AND "id" = ${receiptId}::text FOR UPDATE`,
  );
}

/**
 * Una recepción registrada antes de R8 no tiene `ledgerSeq` en sus líneas: no
 * se puede probar qué ocurrió después, así que no se anula (D32).
 */
export function assertReceiptHasLedgerSeq(lines: InventoryMovement[]): number {
  if (lines.length === 0 || lines.some((line) => line.ledgerSeq === null)) {
    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'RECEIPT_PREDATES_AUDIT',
      title: 'Esta recepción no se puede anular',
      detail:
        'Se registró antes del control de anulaciones. Si la cantidad estaba mal, corrige el stock con un ajuste.',
      data: { products: [...new Set(lines.map((line) => line.productId))] },
    });
  }
  return Math.max(...lines.map((line) => line.ledgerSeq!));
}

/**
 * Ventas, consumos, conteos o ajustes de esos productos registrados después de
 * la recepción (por `ledgerSeq`). Debe llamarse con los productos bloqueados.
 * Los movimientos anteriores a R8 (`ledgerSeq` nulo) son, por construcción,
 * anteriores a cualquier recepción que tenga `ledgerSeq`.
 */
export async function assertNoLaterMovements(
  tx: ScopedTransaction,
  productIds: string[],
  afterSeq: number,
): Promise<void> {
  const later = await tx.inventoryMovement.findMany({
    where: {
      productId: { in: productIds },
      type: { in: LATER_BLOCKING_TYPES },
      ledgerSeq: { gt: afterSeq },
    },
    include: { product: { select: { name: true } } },
    orderBy: [{ ledgerSeq: 'asc' }],
  });
  if (later.length === 0) return;
  throw new ProblemException({
    status: HttpStatus.CONFLICT,
    code: 'RECEIPT_HAS_LATER_MOVEMENTS',
    title: 'Hubo movimientos de estos productos después de la recepción',
    detail:
      'Anularla cambiaría un stock que ya se vendió, se usó o se contó. Corrige la cantidad con un ajuste.',
    data: {
      movements: later.map((movement) => ({
        movementId: movement.id,
        productId: movement.productId,
        name: movement.product.name,
        type: movement.type,
        occurredAt: movement.occurredAt.toISOString(),
        quantityDelta: movement.quantityDelta.toString(),
      })),
    },
  });
}

/**
 * Lo recibido por producto no puede superar el saldo actual (leído con la fila
 * bloqueada): la anulación nunca deja stock negativo, tenga o no conteo.
 */
export async function assertVoidKeepsStock(
  tx: ScopedTransaction,
  lines: InventoryMovement[],
): Promise<void> {
  const received = new Map<string, Prisma.Decimal>();
  for (const line of lines) {
    received.set(
      line.productId,
      (received.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantityDelta),
    );
  }
  const products = await tx.product.findMany({
    where: { id: { in: [...received.keys()] } },
    select: { id: true, name: true, unit: true, stockQuantity: true },
    orderBy: { name: 'asc' },
  });
  const short = products
    .map((product) => {
      const quantity = received.get(product.id)!;
      const balance = new Prisma.Decimal(product.stockQuantity);
      return { product, quantity, balance, after: balance.minus(quantity) };
    })
    .filter(({ after }) => after.isNegative());
  if (short.length === 0) return;
  throw new ProblemException({
    status: HttpStatus.CONFLICT,
    code: 'RECEIPT_VOID_NEGATIVE_STOCK',
    title: 'La anulación dejaría stock negativo',
    detail: 'Hay menos stock que lo que sumó la recepción. Corrige la cantidad con un ajuste.',
    data: {
      products: short.map(({ product, quantity, balance, after }) => ({
        productId: product.id,
        name: product.name,
        unit: product.unit,
        balance: balance.toString(),
        received: quantity.toString(),
        resultingBalance: after.toString(),
      })),
    },
  });
}
