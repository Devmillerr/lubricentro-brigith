import { HttpStatus } from '@nestjs/common';
import { InventoryMovementType, Prisma, type InventoryMovement } from '@prisma/client';
import { MAX_QUANTITY } from '../common/decimal-limits';
import {
  ProblemException,
  ValidationProblemException,
} from '../common/exceptions/problem.exception';
import type { ScopedTransaction } from '../prisma/business-scope';

/**
 * Qué hacer cuando una salida dejaría con saldo negativo un producto **con
 * conteo inicial** (DEC-26):
 * - `BLOCK`: rechaza la operación completa con 422 `INSUFFICIENT_STOCK`
 *   (venta de mostrador, cuando exista).
 * - `WARN`: guarda y devuelve el aviso `INSUFFICIENT_STOCK` (mantenimiento:
 *   el producto ya se usó; ajustes y conteos reflejan el estante).
 *
 * Un producto **sin** conteo inicial nunca se bloquea: se registra con el
 * aviso `PRODUCT_NOT_COUNTED`, porque su saldo no es confiable (DEC-27, BR-P8).
 */
export type StockPolicy = 'BLOCK' | 'WARN';

export interface StockEntry {
  productId: string;
  type: InventoryMovementType;
  /**
   * Con signo: entra +, sale − (BR-P3). Se ignora en `COUNT` y en un
   * `ADJUSTMENT` con `physicalQuantity`, donde el delta se calcula contra el
   * saldo con la fila bloqueada (BR-P7, BR-P7b).
   */
  quantityDelta?: number;
  /** Solo en `COUNT`. */
  countedQuantity?: number;
  /**
   * Solo en `ADJUSTMENT` (R3, BR-P7b): la cantidad que hay en el estante. El
   * delta es `physicalQuantity − saldo`. Exige producto activo (DEC-51) y con
   * conteo (DEC-48), y una diferencia distinta de 0 (DEC-49). No marca
   * `isCounted`. Se guarda en `countedQuantity`.
   */
  physicalQuantity?: number;
  /**
   * Rechaza con 409 `PRODUCT_INACTIVE` si el producto está inactivo (DEC-51).
   * Se evalúa con la fila bloqueada. Lo usan la recepción en lote y, siempre,
   * el ajuste por cantidad física.
   */
  requireActiveProduct?: boolean;
  reason?: string;
  refType?: string;
  refId?: string;
  occurredAt: Date;
}

export interface StockWarning {
  code: 'INSUFFICIENT_STOCK' | 'PRODUCT_NOT_COUNTED';
  message: string;
  productId: string;
  balance?: number;
  requestedQuantity?: number;
}

export interface StockLedgerResult {
  movements: InventoryMovement[];
  warnings: StockWarning[];
}

/** Tipos que consumen stock y por eso pasan por la política (DEC-26/27). */
const CONSUMPTION_TYPES = new Set<InventoryMovementType>([
  InventoryMovementType.SALE,
  InventoryMovementType.MAINTENANCE_USE,
]);

const MAX_QUANTITY_DECIMAL = new Prisma.Decimal(String(MAX_QUANTITY));

interface PlannedMovement {
  entry: StockEntry;
  quantityDelta: Prisma.Decimal;
  previousBalance: Prisma.Decimal | null;
  resultingBalance: Prisma.Decimal;
}

interface ProductPlan {
  productId: string;
  startBalance: Prisma.Decimal;
  wasCounted: boolean;
  finalBalance: Prisma.Decimal;
  isCounted: boolean;
  consumed: Prisma.Decimal;
  movements: PlannedMovement[];
}

/**
 * StockLedger: **único escritor** de movimientos de inventario (R1,
 * 10-OPERACION-REAL.md §2.1). Venta, recepción, ajuste, conteo, mantenimiento
 * y anulaciones pasan por aquí; ningún otro código crea `InventoryMovement`
 * (lo verifica test/stock-ledger.single-writer.spec.ts).
 *
 * Debe llamarse dentro de una transacción de `forBusiness(...)`, la misma que
 * guarda la operación de origen, para que movimiento, saldo en caché y
 * operación se confirmen o se descarten juntos (BR-M10), y **antes de
 * cualquier otra escritura** que referencie esos productos: una FK hacia
 * `products` (p. ej. un `MaintenanceItem`) toma un lock compartido sobre la
 * fila, y dos transacciones que ya lo tienen se traban al pedir el FOR
 * UPDATE. En ella:
 *
 * 1. Bloquea las filas de producto (`FOR UPDATE`, en orden de id para no
 *    provocar deadlocks entre dos operaciones con los mismos productos).
 *    Con READ COMMITTED, la lectura siguiente ya ve el saldo que dejó la
 *    transacción que tenía el bloqueo.
 * 2. Lee saldo y `isCounted` desde la caché de `Product`, filtrando por
 *    negocio: un producto de otro negocio no existe (`PRODUCT_NOT_FOUND`).
 * 3. Calcula todo y evalúa la política **antes** de escribir: un rechazo no
 *    deja nada a medias.
 * 4. Inserta los movimientos (con `resultingBalance` y `createdById`) y
 *    actualiza `Product.stockQuantity`/`isCounted`.
 */
export async function applyStockMovements(
  tx: ScopedTransaction,
  params: {
    businessId: string;
    createdById: string;
    policy: StockPolicy;
    entries: StockEntry[];
    /**
     * Campo de `errors[]` en el 422 `INSUFFICIENT_STOCK` de `BLOCK` y en el 400
     * por saldo fuera de rango. Por defecto `items` (el cuerpo del
     * mantenimiento); la venta y la recepción usan `lines`.
     */
    insufficientStockField?: string;
  },
): Promise<StockLedgerResult> {
  const { businessId, createdById, policy, entries, insufficientStockField = 'items' } = params;
  if (entries.length === 0) {
    return { movements: [], warnings: [] };
  }

  const productIds = [...new Set(entries.map((entry) => entry.productId))].sort();

  // Los ids son `text` en Postgres (String de Prisma, sin @db.Uuid): se
  // castea explícito porque el driver infiere `uuid` para strings con forma
  // de UUID y Postgres no compara text = uuid.
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "products" WHERE "businessId" = ${businessId}::text AND "id" = ANY(${productIds}::text[]) ORDER BY "id" FOR UPDATE`,
  );

  const products = await tx.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const productId of productIds) {
    if (!productById.has(productId)) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'PRODUCT_NOT_FOUND',
        title: 'Producto no encontrado',
      });
    }
  }

  const plans = productIds.map((productId) => {
    const product = productById.get(productId)!;
    const startBalance = new Prisma.Decimal(product.stockQuantity ?? 0);
    const plan: ProductPlan = {
      productId,
      startBalance,
      wasCounted: Boolean(product.isCounted),
      finalBalance: startBalance,
      isCounted: Boolean(product.isCounted),
      consumed: new Prisma.Decimal(0),
      movements: [],
    };

    for (const entry of entries.filter((e) => e.productId === productId)) {
      if (entry.requireActiveProduct || isPhysicalAdjustment(entry)) {
        assertActive(product);
      }
      const before = plan.finalBalance;
      let quantityDelta: Prisma.Decimal;
      let previousBalance: Prisma.Decimal | null = null;

      if (entry.type === InventoryMovementType.COUNT) {
        // Invariante 2: delta = contado − saldo, así el saldo queda en lo contado.
        quantityDelta = new Prisma.Decimal(entry.countedQuantity ?? 0).minus(before);
        previousBalance = before;
        plan.isCounted = true;
      } else if (isPhysicalAdjustment(entry)) {
        assertCounted(plan.isCounted);
        // Mismo cálculo que COUNT, sobre el saldo leído con la fila bloqueada.
        quantityDelta = new Prisma.Decimal(entry.physicalQuantity).minus(before);
        if (quantityDelta.isZero()) {
          throw new ProblemException({
            status: HttpStatus.BAD_REQUEST,
            code: 'NO_DIFFERENCE',
            title: 'La cantidad física es igual al saldo del sistema',
            detail: `El sistema ya tiene ${before.toString()}: no hay nada que ajustar.`,
          });
        }
        previousBalance = before;
      } else {
        quantityDelta = new Prisma.Decimal(entry.quantityDelta ?? 0);
        if (CONSUMPTION_TYPES.has(entry.type) && quantityDelta.isNegative()) {
          plan.consumed = plan.consumed.plus(quantityDelta.negated());
        }
      }

      plan.finalBalance = before.plus(quantityDelta);
      // Saldo y delta son Decimal(12,3): lo que no cabe es un 400, no un 500
      // al escribir. Se evalúa antes de escribir nada.
      if (
        plan.finalBalance.abs().greaterThan(MAX_QUANTITY_DECIMAL) ||
        quantityDelta.abs().greaterThan(MAX_QUANTITY_DECIMAL)
      ) {
        throw new ValidationProblemException([
          {
            field:
              entry.type === InventoryMovementType.COUNT
                ? 'countedQuantity'
                : isPhysicalAdjustment(entry)
                  ? 'physicalQuantity'
                  : insufficientStockField,
            // Con el nombre, no con el id: el mensaje se muestra al usuario.
            message: `El saldo de «${product.name}» superaría el máximo admitido (999 999 999,999).`,
          },
        ]);
      }
      plan.movements.push({
        entry,
        quantityDelta,
        previousBalance,
        resultingBalance: plan.finalBalance,
      });
    }
    return plan;
  });

  const warnings: StockWarning[] = [];
  for (const plan of plans) {
    if (plan.consumed.isZero()) continue;

    if (!plan.wasCounted) {
      warnings.push({
        code: 'PRODUCT_NOT_COUNTED',
        message:
          'El producto no tiene conteo inicial: se registra el movimiento, sin evaluar stock.',
        productId: plan.productId,
      });
      continue;
    }

    if (plan.finalBalance.isNegative()) {
      const balance = plan.startBalance.toNumber();
      const requestedQuantity = plan.consumed.toNumber();
      if (policy === 'BLOCK') {
        // Dentro de la transacción: nada de lo anterior se confirma.
        throw new ProblemException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'INSUFFICIENT_STOCK',
          title: 'Stock insuficiente',
          detail: `El producto ${plan.productId} quedaría con saldo negativo.`,
          errors: [
            {
              field: insufficientStockField,
              message: `Saldo actual ${balance}, cantidad pedida ${requestedQuantity}`,
            },
          ],
        });
      }
      warnings.push({
        code: 'INSUFFICIENT_STOCK',
        message: 'El producto quedaría con saldo negativo.',
        productId: plan.productId,
        balance,
        requestedQuantity,
      });
    }
  }

  const movements: InventoryMovement[] = [];
  for (const plan of plans) {
    for (const planned of plan.movements) {
      const { entry } = planned;
      movements.push(
        await tx.inventoryMovement.create({
          data: {
            // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
            businessId,
            productId: plan.productId,
            type: entry.type,
            quantityDelta: planned.quantityDelta,
            countedQuantity:
              entry.type === InventoryMovementType.COUNT
                ? entry.countedQuantity
                : isPhysicalAdjustment(entry)
                  ? entry.physicalQuantity
                  : null,
            previousBalance: planned.previousBalance,
            resultingBalance: planned.resultingBalance,
            reason: entry.reason,
            refType: entry.refType,
            refId: entry.refId,
            occurredAt: entry.occurredAt,
            createdById,
          },
        }),
      );
    }

    await tx.product.update({
      where: { id: plan.productId },
      data: { stockQuantity: plan.finalBalance, isCounted: plan.isCounted },
    });
  }

  return { movements, warnings };
}

function isPhysicalAdjustment(
  entry: StockEntry,
): entry is StockEntry & { physicalQuantity: number } {
  return entry.type === InventoryMovementType.ADJUSTMENT && entry.physicalQuantity !== undefined;
}

/**
 * Recepción y ajuste físico no operan sobre productos inactivos (DEC-51). Se
 * evalúa antes de escribir, así el rechazo no deja nada a medias.
 */
function assertActive(product: { isActive: boolean }): void {
  if (!product.isActive) {
    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'PRODUCT_INACTIVE',
      title: 'El producto está inactivo',
      detail: 'Reactívalo antes de mover su stock.',
    });
  }
}

/** Un ajuste por cantidad física exige conteo inicial (DEC-48). */
function assertCounted(isCounted: boolean): void {
  if (!isCounted) {
    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'ADJUSTMENT_REQUIRES_COUNT',
      title: 'El producto no tiene conteo inicial',
      detail: 'Registra un conteo antes de ajustar su stock.',
    });
  }
}
