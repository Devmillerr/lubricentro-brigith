import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma, type InventoryMovement } from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
  type FieldError,
} from '../common/exceptions/problem.exception';
import { paginate, type Page } from '../common/pagination';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import type { CreateCountDto } from './dto/create-count.dto';
import type { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { MAX_MONEY, MAX_MONEY_MESSAGE } from '../common/decimal-limits';
import { resolveDashboardPeriod } from '../dashboard/dashboard-period';
import type { ListReceiptsQueryDto } from './dto/list-receipts-query.dto';
import { summarizeReceiptLinesByProduct, type ReceiptProductSummary } from './receipt-summary';
import {
  assertReceiptNotInFuture,
  findLaterStockChecks,
  findPossibleDuplicateReceipt,
  resolveLaterStockChecks,
  validateLaterStockChoices,
  type LaterStockChoice,
} from './receipt-checks';
import {
  RECEIPT_SUPPLIER_SELECT,
  assertDocumentFree,
  assertDocumentHasSupplier,
  assertPurchaseDate,
  assertSupplierUsable,
  duplicateDocument,
  isDocumentUniqueViolation,
  normalizeDocumentRef,
  receiptView,
  type ReceiptView,
} from './receipt-purchase';
import { localDateString, toDbDate } from '../common/date-only';
import {
  assertExchangeRate,
  buildPayableDraft,
  createPayable,
  exchangeRateWarning,
  type PayableDraft,
} from '../payables/payable-rules';
import { PAYABLE_INCLUDE, payableView, type PayableView } from '../payables/payable-view';
import { assertNoActivePayments, lockPayable } from '../payables/payables.service';
import {
  assertNoLaterMovements,
  assertReceiptHasLedgerSeq,
  assertVoidKeepsStock,
  lockReceipt,
} from './receipt-void';
import { applyStockMovements, lockProducts, type StockEntry } from './stock-ledger';

export interface StockView {
  productId: string;
  balance: number;
  isCounted: boolean;
}

/** Límite de líneas por recepción (06-API.md §2, "Cambios de R3"). */
export const MAX_RECEIPT_LINES = 100;

/**
 * Entrada de una recepción en lote (R3, BR-P6). Tipo interno del dominio: el
 * DTO público con class-validator se agrega junto con el endpoint.
 */
export interface ReceiptBatchInput {
  id?: string;
  occurredAt?: string;
  note?: string;
  /** `purchaseCost`: total pagado por la línea, opcional (DEC-90). */
  lines: { productId: string; quantity: number; purchaseCost?: number | null }[];
  /** Resolución por producto ante conteos o ajustes posteriores (R8, DEC-96). */
  laterStockChecks?: LaterStockChoice[];
  /** Guardar aunque se parezca a otra recepción reciente (R8, DEC-96). */
  acknowledgePossibleDuplicate?: boolean;
  /** Proveedor, comprobante y fecha de compra (R8, DEC-95). */
  supplierId?: string;
  documentRef?: string;
  purchaseDate?: string;
  /** Moneda, tipo de cambio de la compra y condición de pago (R8, DEC-98 a DEC-100). */
  currency?: 'PEN' | 'USD';
  purchaseExchangeRate?: number;
  paymentTerms?: 'CASH' | 'CREDIT';
  /** Solo al crédito: vencimiento pactado con motivo. */
  dueDate?: string;
  dueDateReason?: string;
}

/** Datos de compra que se completan en una recepción ya registrada (R8, BR-K5). */
export interface ReceiptPurchaseInfoInput {
  supplierId?: string;
  documentRef?: string;
  purchaseDate?: string;
}

export interface ReceiptBatchResult {
  receipt: ReceiptView;
  /** Solo los `PURCHASE_IN` de la recepción. */
  lines: InventoryMovement[];
  /**
   * Ajustes de regularización enlazados a la recepción (R8, `SET_PHYSICAL`):
   * visibles y siempre elegidos por el usuario.
   */
  adjustments: InventoryMovement[];
  /** Movimientos `PURCHASE_VOID` de la anulación (R8). Vacío si no está anulada. */
  voids?: InventoryMovement[];
  /** Deuda activa de la recepción (R8), o null. */
  payable?: PayableView | null;
  /** Avisos sin bloqueo (R8). */
  warnings?: string[];
}

export const RECEIPT_REF_TYPE = 'InventoryReceipt';

/** Producto en una lista de alertas de stock (R3, BR-P19). */
export interface StockAlertProduct {
  productId: string;
  name: string;
  unit: string;
  balance: number;
}

export interface StockAlerts {
  outOfStock: StockAlertProduct[];
  negative: StockAlertProduct[];
  notCountedCount: number;
}

/** Línea de una recepción vista desde el historial (DEC-94). */
export interface ReceiptLinePreview {
  productId: string;
  name: string;
  unit: string;
  /** Cantidad recibida, en la unidad de stock del producto (Decimal como string). */
  quantity: string;
  /** Monto pagado por la línea; `null` si no se registró (DEC-90). */
  purchaseCost: string | null;
}

/** Productos que se adelantan en cada fila del historial (DEC-94). */
export const RECEIPT_PREVIEW_LINES = 3;

/**
 * Elemento del historial de recepciones: la cabecera, cuántas líneas tiene y
 * las primeras, por nombre de producto (DEC-94), para saber qué llegó sin
 * abrir la recepción.
 */
export interface ReceiptSummary extends Omit<
  ReceiptView,
  'laterStockResolution' | 'possibleDuplicateAcknowledged' | 'purchaseInfoRecordedById'
> {
  lineCount: number;
  preview: ReceiptLinePreview[];
}

/**
 * Total comprado en un mes calendario (DEC-90): suma de los montos pagados en
 * las recepciones de ese mes, en la zona horaria del negocio. Las recepciones
 * o líneas sin monto se cuentan aparte: el total no las estima.
 */
export interface ReceiptsMonthSummary {
  /** `YYYY-MM`. */
  month: string;
  from: Date;
  to: Date;
  timezone: string;
  receiptCount: number;
  /**
   * Suma de `totalCost` de las recepciones en **soles** (moneda PEN o sin
   * moneda, como las anteriores a R8). Nunca incluye dólares (DEC-100).
   */
  totalCost: string;
  /** Recepciones del mes sin ningún monto registrado. */
  receiptsWithoutCost: number;
  /** Líneas del mes sin monto (incluye las de recepciones con monto parcial). */
  linesWithoutCost: number;
  /** Lo comprado de cada producto en el mes, en soles (DEC-94). */
  products: ReceiptProductSummary[];
  /** Compras en dólares del mes (R8), aparte; null si no hubo ninguna. */
  usd: ReceiptsUsdSummary | null;
}

/** Compras en USD de un mes (R8, DEC-100): nunca se suman a los soles. */
export interface ReceiptsUsdSummary {
  receiptCount: number;
  totalCost: string;
  products: ReceiptProductSummary[];
  /**
   * Equivalente en soles con el tipo de cambio de cada compra, solo de las que
   * lo tienen; informativo. null si ninguna tiene tipo de cambio.
   */
  penEquivalent: string | null;
  /** Compras en USD con monto pero sin tipo de cambio: no entran en el equivalente. */
  withoutRateCount: number;
}

/**
 * Todo cambio de stock es un movimiento inmutable; el saldo es la suma de
 * sus `quantityDelta` (BR-P2, BR-P3, invariante 1 de 05-DATABASE.md §3). Las
 * escrituras pasan por el StockLedger, que además mantiene el saldo en caché
 * de `Product` (R1). No hay `update`/`delete` para movimientos (BR-G5).
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saldo por producto, con `isCounted` (BR-P8). Lee la caché de `Product`. */
  async getStock(businessId: string, productId: string): Promise<StockView> {
    const product = await forBusiness(this.prisma, businessId).product.findFirst({
      where: { id: productId },
    });
    if (!product) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'PRODUCT_NOT_FOUND',
        title: 'Producto no encontrado',
      });
    }
    return toStockView(product);
  }

  /**
   * Stock que requiere atención (R3, BR-P19, DEC-50). Solo productos activos
   * que controlan stock (BR-P16): uno sin control no tiene saldo que vigilar,
   * aunque se haya contado antes de desmarcarlo (R7, B-163). Agotados
   * (saldo = 0) y negativos (saldo < 0) solo incluyen productos con conteo,
   * porque el saldo de uno sin conteo no es confiable (BR-P8); esos solo suman
   * en `notCountedCount`. Lee la caché de `Product`. Sin stock mínimo por
   * producto. Las listas van por nombre y sin paginar: dos consultas en total.
   * El dashboard reutiliza este método (DEC-82).
   */
  async getAlerts(businessId: string): Promise<StockAlerts> {
    const scoped = forBusiness(this.prisma, businessId);
    const [atOrBelowZero, notCountedCount] = await Promise.all([
      scoped.product.findMany({
        where: { isActive: true, tracksStock: true, isCounted: true, stockQuantity: { lte: 0 } },
        select: { id: true, name: true, unit: true, stockQuantity: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      // Sin los que no controlan stock (BR-P16): su conteo no importa y así el
      // número coincide con el filtro "Sin conteo" de Inventario.
      scoped.product.count({ where: { isActive: true, isCounted: false, tracksStock: true } }),
    ]);

    const alerts: StockAlerts = { outOfStock: [], negative: [], notCountedCount };
    for (const product of atOrBelowZero) {
      const item: StockAlertProduct = {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        balance: Number(product.stockQuantity),
      };
      (item.balance < 0 ? alerts.negative : alerts.outOfStock).push(item);
    }
    return alerts;
  }

  async listMovements(
    businessId: string,
    query: ListMovementsQueryDto,
  ): Promise<Page<InventoryMovement>> {
    const limit = query.limit ?? 20;
    const where: Prisma.InventoryMovementWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;

    const rows = await forBusiness(this.prisma, businessId).inventoryMovement.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return paginate(rows, limit);
  }

  /**
   * Conteo físico: sirve para el stock inicial y para recontar (BR-P7).
   * `quantityDelta = countedQuantity − previousBalance` (invariante 2), así
   * que el saldo posterior queda igual a lo contado.
   */
  async count(businessId: string, userId: string, dto: CreateCountDto): Promise<InventoryMovement> {
    return this.applyOne(businessId, userId, {
      productId: dto.productId,
      type: InventoryMovementType.COUNT,
      countedQuantity: dto.countedQuantity,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
  }

  /**
   * Ingreso de un solo producto, sin cabecera (contrato anterior a R3). Desde
   * R3, `POST /inventory/receipts` usa {@link createReceiptBatch}; este método
   * ya no tiene endpoint y solo lo usan las pruebas.
   */
  async receipt(
    businessId: string,
    userId: string,
    dto: { productId: string; quantity: number; occurredAt?: string },
  ): Promise<InventoryMovement> {
    return this.applyOne(businessId, userId, {
      productId: dto.productId,
      type: InventoryMovementType.PURCHASE_IN,
      quantityDelta: dto.quantity,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
  }

  /**
   * Recepción en lote (R3, BR-P6): una cabecera `InventoryReceipt` y un
   * `PURCHASE_IN` por línea, enlazados con `refType`/`refId`.
   *
   * Todo o nada: la forma del lote se valida antes de abrir la transacción,
   * y dentro de ella el StockLedger (que bloquea los productos) rechaza
   * productos inexistentes, de otro negocio o inactivos (DEC-51) **antes de
   * escribir**. La cabecera se crea después del ledger, igual que el
   * mantenimiento, y un fallo al crearla revierte los movimientos y los
   * saldos de la misma transacción. La idempotencia por `Idempotency-Key`
   * la aplica la capa HTTP (`IdempotencyService`), como en el resto de
   * `POST /inventory/*`.
   */
  async createReceiptBatch(
    businessId: string,
    userId: string,
    input: ReceiptBatchInput,
    now: Date = new Date(),
  ): Promise<ReceiptBatchResult> {
    const totalCost = validateReceiptBatch(input);
    validateLaterStockChoices(
      input.laterStockChecks,
      input.lines.map((line) => line.productId),
    );

    const receiptId = input.id ?? randomUUID();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
    assertReceiptNotInFuture(occurredAt, now);
    const documentRef = normalizeDocumentRef(input.documentRef);
    assertDocumentHasSupplier(documentRef, input.supplierId);
    const timezone = await this.timezoneOf(businessId);
    const today = localDateString(now, timezone);
    assertPurchaseDate(input.purchaseDate, today);
    const credit = validateCreditPurchase(input, totalCost, occurredAt, timezone, today);
    const purchaseRate =
      input.purchaseExchangeRate !== undefined
        ? assertExchangeRate(input.purchaseExchangeRate, 'purchaseExchangeRate')
        : null;

    const created = forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      // R8 (DEC-96): con los productos bloqueados, ningún conteo ni recepción
      // simultánea entra entre las comprobaciones y la escritura.
      const productIds = input.lines.map((line) => line.productId);
      await lockProducts(tx, businessId, productIds);

      if (input.supplierId) await assertSupplierUsable(tx, input.supplierId);
      if (documentRef && input.supplierId) {
        await assertDocumentFree(tx, { supplierId: input.supplierId, documentRef });
      }

      const resolutions = resolveLaterStockChecks(
        await findLaterStockChecks(tx, productIds, occurredAt),
        input.laterStockChecks,
      );

      // Con comprobante, la unicidad del comprobante ya cubre el duplicado.
      const duplicate = documentRef
        ? null
        : await findPossibleDuplicateReceipt(tx, {
            receiptRefType: RECEIPT_REF_TYPE,
            occurredAt,
            supplierId: input.supplierId ?? null,
            lines: input.lines,
          });
      if (duplicate && !input.acknowledgePossibleDuplicate) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'POSSIBLE_DUPLICATE_RECEIPT',
          title: 'Ya hay una recepción muy parecida',
          detail:
            'Hay otra recepción con los mismos productos y cantidades a pocos días de esta fecha. Revísala antes de registrar esta.',
          data: {
            receiptId: duplicate.id,
            occurredAt: duplicate.occurredAt.toISOString(),
            createdAt: duplicate.createdAt.toISOString(),
          },
        });
      }

      const entries: StockEntry[] = input.lines.map((line) => ({
        productId: line.productId,
        type: InventoryMovementType.PURCHASE_IN,
        quantityDelta: line.quantity,
        purchaseCost: line.purchaseCost ?? undefined,
        requireActiveProduct: true,
        refType: RECEIPT_REF_TYPE,
        refId: receiptId,
        occurredAt,
      }));
      // SET_PHYSICAL: después de sumar, ajuste hasta lo que el usuario contó en
      // el estante, enlazado a la recepción. El ledger procesa en orden las
      // entradas de un mismo producto y omite el ajuste si ya coincide.
      for (const resolution of resolutions) {
        if (resolution.resolution !== 'SET_PHYSICAL') continue;
        entries.push({
          productId: resolution.productId,
          type: InventoryMovementType.ADJUSTMENT,
          physicalQuantity: Number(resolution.physicalQuantity),
          skipIfNoDifference: true,
          reason: `Regularización de recepción atrasada ${receiptId}`,
          refType: RECEIPT_REF_TYPE,
          refId: receiptId,
          occurredAt: now,
        });
      }

      const { movements } = await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        insufficientStockField: 'lines',
        entries,
      });

      const receipt = await tx.inventoryReceipt.create({
        data: {
          id: receiptId,
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
          businessId,
          occurredAt,
          note: input.note ?? null,
          totalCost,
          ...(resolutions.length > 0
            ? { laterStockResolution: resolutions as unknown as Prisma.InputJsonValue }
            : {}),
          possibleDuplicateAcknowledged: duplicate ? true : null,
          supplierId: input.supplierId ?? null,
          documentRef,
          ...(input.purchaseDate
            ? {
                purchaseDate: toDbDate(input.purchaseDate),
                purchaseDateSource: 'DOCUMENT' as const,
              }
            : credit
              ? {
                  // Al crédito sin fecha escrita: se fija la de recepción (DEC-95).
                  purchaseDate: toDbDate(credit.purchaseDate),
                  purchaseDateSource: 'RECEIPT_DATE' as const,
                }
              : {}),
          currency: input.currency ?? null,
          purchaseExchangeRate: purchaseRate,
          paymentTerms: input.paymentTerms ?? null,
          createdById: userId,
        },
        include: { supplier: RECEIPT_SUPPLIER_SELECT },
      });

      // Compra al crédito: la deuda nace en la misma transacción (DEC-98).
      const payable = credit
        ? await createPayable(tx, {
            businessId,
            userId,
            supplierId: input.supplierId!,
            receiptId,
            draft: credit.draft,
          })
        : null;

      // El ledger agrupa por producto: se devuelven en el orden de las líneas.
      const purchases = movements.filter((m) => m.type === InventoryMovementType.PURCHASE_IN);
      const byProduct = new Map(purchases.map((movement) => [movement.productId, movement]));
      const payableResult = payable
        ? payableView(
            {
              ...payable,
              supplier: receipt.supplier,
              receipt: { id: receipt.id, occurredAt, documentRef },
            },
            today,
          )
        : null;
      const warnings = [
        ...(payableResult?.status === 'OVERDUE' ? ['PAYABLE_ALREADY_OVERDUE'] : []),
        ...(exchangeRateWarning(purchaseRate) ? ['EXCHANGE_RATE_OUT_OF_RANGE'] : []),
      ];
      return {
        receipt: receiptView(receipt),
        lines: input.lines.map((line) => byProduct.get(line.productId)!),
        adjustments: movements.filter((m) => m.type === InventoryMovementType.ADJUSTMENT),
        voids: [],
        payable: payableResult,
        warnings,
      };
    });
    try {
      return await created;
    } catch (error) {
      // Dos registros simultáneos del mismo comprobante: el índice parcial decide.
      if (isDocumentUniqueViolation(error)) throw duplicateDocument();
      throw error;
    }
  }

  /**
   * Completa proveedor, comprobante o fecha de compra de una recepción ya
   * registrada (R8, DEC-95, BR-K5). Cada campo solo pasa de vacío a valor:
   * repetir el mismo valor no hace nada y uno distinto responde 409
   * `PURCHASE_INFO_ALREADY_SET`. Nunca toca movimientos ni saldos. La
   * recepción se bloquea para que dos cambios simultáneos no se pisen.
   */
  async setPurchaseInfo(
    businessId: string,
    userId: string,
    receiptId: string,
    input: ReceiptPurchaseInfoInput,
    now: Date = new Date(),
  ): Promise<ReceiptView> {
    const documentRef = normalizeDocumentRef(input.documentRef);
    if (
      input.supplierId === undefined &&
      documentRef === null &&
      input.purchaseDate === undefined
    ) {
      throw new ValidationProblemException([
        {
          field: 'supplierId',
          message: 'Indica el proveedor, el comprobante o la fecha de compra.',
        },
      ]);
    }
    const timezone = await this.timezoneOf(businessId);
    assertPurchaseDate(input.purchaseDate, localDateString(now, timezone));

    const updated = forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "inventory_receipts" WHERE "businessId" = ${businessId}::text AND "id" = ${receiptId}::text FOR UPDATE`,
      );
      const receipt = await tx.inventoryReceipt.findFirst({ where: { id: receiptId } });
      if (!receipt) throw receiptNotFound();
      if (receipt.voidedAt) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'RECEIPT_VOIDED',
          title: 'La recepción está anulada',
        });
      }

      const data: Prisma.InventoryReceiptUncheckedUpdateInput = {};
      const conflicts: FieldError[] = [];
      if (input.supplierId !== undefined) {
        if (receipt.supplierId === null) data.supplierId = input.supplierId;
        else if (receipt.supplierId !== input.supplierId) {
          conflicts.push({ field: 'supplierId', message: 'La recepción ya tiene proveedor.' });
        }
      }
      if (documentRef !== null) {
        if (receipt.documentRef === null) data.documentRef = documentRef;
        else if (receipt.documentRef !== documentRef) {
          conflicts.push({ field: 'documentRef', message: 'La recepción ya tiene comprobante.' });
        }
      }
      if (input.purchaseDate !== undefined) {
        const current = receipt.purchaseDate
          ? receipt.purchaseDate.toISOString().slice(0, 10)
          : null;
        if (current === null) {
          data.purchaseDate = toDbDate(input.purchaseDate);
          data.purchaseDateSource = 'DOCUMENT';
        } else if (current !== input.purchaseDate) {
          conflicts.push({
            field: 'purchaseDate',
            message: 'La recepción ya tiene fecha de compra.',
          });
        }
      }
      if (conflicts.length > 0) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'PURCHASE_INFO_ALREADY_SET',
          title: 'Esos datos de compra ya están registrados',
          detail: 'Los datos de compra de una recepción se completan una sola vez y no se cambian.',
          errors: conflicts,
        });
      }

      const supplierId = (data.supplierId as string | undefined) ?? receipt.supplierId;
      if (data.supplierId) await assertSupplierUsable(tx, data.supplierId as string);
      assertDocumentHasSupplier(documentRef, supplierId);
      if (data.documentRef && supplierId) {
        await assertDocumentFree(tx, {
          supplierId,
          documentRef: data.documentRef as string,
          exceptReceiptId: receiptId,
        });
      }

      if (Object.keys(data).length === 0) {
        const current = await tx.inventoryReceipt.findFirstOrThrow({
          where: { id: receiptId },
          include: { supplier: RECEIPT_SUPPLIER_SELECT },
        });
        return receiptView(current);
      }
      const saved = await tx.inventoryReceipt.update({
        where: { id: receiptId },
        data: { ...data, purchaseInfoRecordedAt: now, purchaseInfoRecordedById: userId },
        include: { supplier: RECEIPT_SUPPLIER_SELECT },
      });
      return receiptView(saved);
    });
    try {
      return await updated;
    } catch (error) {
      if (isDocumentUniqueViolation(error)) throw duplicateDocument();
      throw error;
    }
  }

  /**
   * Anula una recepción (R8, DEC-97, BR-K6) en una sola transacción. Orden de
   * bloqueo fijo: recepción → productos (→ deuda, desde F4), igual en toda
   * operación que los toque, para no provocar deadlocks. Todo se valida antes
   * de escribir; cualquier rechazo deja la base como estaba. Nunca edita ni
   * borra el `PURCHASE_IN`: agrega un `PURCHASE_VOID` por línea y marca la
   * cabecera. El sistema no cambia cantidades ni crea ajustes por su cuenta.
   */
  async voidReceipt(
    businessId: string,
    userId: string,
    receiptId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<ReceiptBatchResult> {
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      throw new ValidationProblemException([
        { field: 'reason', message: 'Escribe el motivo de la anulación (de 3 a 500 caracteres).' },
      ]);
    }

    await forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      // 1. Recepción bloqueada: dos anulaciones simultáneas se ordenan aquí.
      await lockReceipt(tx, businessId, receiptId);
      const receipt = await tx.inventoryReceipt.findFirst({ where: { id: receiptId } });
      if (!receipt) throw receiptNotFound();
      if (receipt.voidedAt) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'RECEIPT_ALREADY_VOIDED',
          title: 'La recepción ya está anulada',
          data: { voidedAt: receipt.voidedAt.toISOString(), voidedById: receipt.voidedById },
        });
      }

      // 1b. Deuda activa bloqueada (orden recepción → deuda → productos): con
      // pagos activos no se anula; sin pagos, se anula junto con la recepción.
      const payable = await tx.supplierPayable.findFirst({
        where: { receiptId, voidedAt: null },
      });
      if (payable) {
        await lockPayable(tx, businessId, payable.id);
        const locked = await tx.supplierPayable.findFirstOrThrow({ where: { id: payable.id } });
        assertNoActivePayments(locked);
      }

      // 2. Solo recepciones con ledgerSeq (posteriores a R8, D32).
      const lines = await tx.inventoryMovement.findMany({
        where: {
          refType: RECEIPT_REF_TYPE,
          refId: receiptId,
          type: InventoryMovementType.PURCHASE_IN,
        },
      });
      const lastSeq = assertReceiptHasLedgerSeq(lines);
      const productIds = [...new Set(lines.map((line) => line.productId))];

      // 3. Productos bloqueados: lo que sigue ve todo lo confirmado antes.
      await lockProducts(tx, businessId, productIds);
      await assertNoLaterMovements(tx, productIds, lastSeq);
      await assertVoidKeepsStock(tx, lines);

      // 4. Movimientos inversos (el ledger vuelve a impedir el saldo negativo).
      await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        insufficientStockField: 'lines',
        entries: lines.map((line) => ({
          productId: line.productId,
          type: InventoryMovementType.PURCHASE_VOID,
          quantityDelta: new Prisma.Decimal(line.quantityDelta).negated().toNumber(),
          reason: trimmed,
          refType: RECEIPT_REF_TYPE,
          refId: receiptId,
          occurredAt: now,
        })),
      });

      // 5. Cabecera: solo los campos de anulación, y solo si seguía activa.
      const marked = await tx.inventoryReceipt.updateMany({
        where: { id: receiptId, voidedAt: null },
        data: { voidedAt: now, voidedById: userId, voidReason: trimmed },
      });
      if (marked.count !== 1) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'RECEIPT_ALREADY_VOIDED',
          title: 'La recepción ya está anulada',
        });
      }
      if (payable) {
        await tx.supplierPayable.update({
          where: { id: payable.id },
          data: { voidedAt: now, voidedById: userId, voidReason: trimmed },
        });
      }
    });

    return this.getReceipt(businessId, receiptId);
  }

  private async timezoneOf(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    return business.timezone;
  }

  /**
   * Historial de recepciones (R3), de la más reciente a la más antigua por
   * `occurredAt`, con `id` como desempate estable para el cursor. Con
   * `month` (DEC-94), solo las de ese mes en la zona del negocio; sin él,
   * todo el historial. Dos consultas por página, sin importar cuántas
   * recepciones traiga: las cabeceras y sus líneas con el producto, de las
   * que salen la cantidad de líneas y la vista previa.
   */
  async listReceipts(
    businessId: string,
    query: ListReceiptsQueryDto,
    now: Date = new Date(),
  ): Promise<Page<ReceiptSummary>> {
    const limit = query.limit ?? 20;
    const scoped = forBusiness(this.prisma, businessId);
    const period = query.month ? await this.monthPeriod(businessId, query.month, now) : null;

    const rows = await scoped.inventoryReceipt.findMany({
      where: period ? { occurredAt: { gte: period.from, lt: period.to } } : {},
      include: { supplier: RECEIPT_SUPPLIER_SELECT },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = paginate(rows, limit);
    if (page.items.length === 0) return { items: [], nextCursor: page.nextCursor };

    const lines = await scoped.inventoryMovement.findMany({
      where: {
        refType: RECEIPT_REF_TYPE,
        refId: { in: page.items.map((r) => r.id) },
        type: InventoryMovementType.PURCHASE_IN,
      },
      include: { product: true },
    });
    const linesByReceipt = new Map<string, typeof lines>();
    for (const line of lines) {
      const list = linesByReceipt.get(line.refId!) ?? [];
      list.push(line);
      linesByReceipt.set(line.refId!, list);
    }

    return {
      items: page.items.map((receipt) => {
        const receiptLines = (linesByReceipt.get(receipt.id) ?? []).sort((a, b) =>
          a.product.name.localeCompare(b.product.name, 'es'),
        );
        return {
          ...receiptHeader(receiptView(receipt)),
          lineCount: receiptLines.length,
          preview: receiptLines.slice(0, RECEIPT_PREVIEW_LINES).map((line) => ({
            productId: line.productId,
            name: line.product.name,
            unit: line.product.unit,
            quantity: line.quantityDelta.toString(),
            purchaseCost: line.purchaseCost?.toFixed(2) ?? null,
          })),
        };
      }),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Total comprado en el mes `month` (`YYYY-MM`, por defecto el actual) en
   * la zona horaria del negocio (DEC-79, DEC-90). Suma `totalCost` de las
   * cabeceras, que guardan la suma de sus líneas; no estima lo que no tiene
   * monto: lo informa aparte. Desde DEC-94 también da lo comprado de cada
   * producto, a partir de las mismas líneas. Cuatro consultas, sin importar
   * el volumen.
   */
  async receiptsMonthSummary(
    businessId: string,
    month: string | undefined,
    now: Date = new Date(),
  ): Promise<ReceiptsMonthSummary> {
    const period = await this.monthPeriod(businessId, month, now);
    const scoped = forBusiness(this.prisma, businessId);
    // Las recepciones anuladas no cuentan en lo comprado (R8, DEC-97).
    const where = { occurredAt: { gte: period.from, lt: period.to }, voidedAt: null };
    const receipts = await scoped.inventoryReceipt.findMany({
      where,
      select: { id: true, currency: true, totalCost: true, purchaseExchangeRate: true },
    });
    const isUsd = (r: { currency: string | null }) => r.currency === 'USD';
    const penReceipts = receipts.filter((r) => !isUsd(r));
    const usdReceipts = receipts.filter(isUsd);
    const sum = (list: typeof receipts) =>
      list.reduce((acc, r) => acc.plus(r.totalCost ?? 0), new Prisma.Decimal(0));
    const lines =
      receipts.length === 0
        ? []
        : await scoped.inventoryMovement.findMany({
            where: {
              refType: RECEIPT_REF_TYPE,
              refId: { in: receipts.map((receipt) => receipt.id) },
              type: InventoryMovementType.PURCHASE_IN,
            },
            include: { product: true },
          });
    const usdIds = new Set(usdReceipts.map((r) => r.id));
    const penLines = lines.filter((line) => !usdIds.has(line.refId!));
    const usdLines = lines.filter((line) => usdIds.has(line.refId!));
    const rated = usdReceipts.filter(
      (r) => r.totalCost !== null && r.purchaseExchangeRate !== null,
    );
    return {
      month: period.date.slice(0, 7),
      from: period.from,
      to: period.to,
      timezone: period.timezone,
      receiptCount: receipts.length,
      totalCost: sum(penReceipts).toFixed(2),
      receiptsWithoutCost: receipts.filter((r) => r.totalCost === null).length,
      linesWithoutCost: lines.filter((line) => line.purchaseCost === null).length,
      products: summarizeReceiptLinesByProduct(penLines),
      usd:
        usdReceipts.length === 0
          ? null
          : {
              receiptCount: usdReceipts.length,
              totalCost: sum(usdReceipts).toFixed(2),
              products: summarizeReceiptLinesByProduct(usdLines),
              penEquivalent:
                rated.length === 0
                  ? null
                  : rated
                      .reduce(
                        (acc, r) =>
                          acc.plus(
                            new Prisma.Decimal(r.totalCost!)
                              .times(r.purchaseExchangeRate!)
                              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
                          ),
                        new Prisma.Decimal(0),
                      )
                      .toFixed(2),
              withoutRateCount: usdReceipts.filter(
                (r) => r.totalCost !== null && r.purchaseExchangeRate === null,
              ).length,
            },
    };
  }

  /** Mes calendario `YYYY-MM` (por defecto el actual) en la zona del negocio. */
  private async monthPeriod(businessId: string, month: string | undefined, now: Date) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new ValidationProblemException([
        { field: 'month', message: 'El mes debe tener el formato YYYY-MM.' },
      ]);
    }
    return resolveDashboardPeriod(
      { period: 'month', ...(month ? { date: `${month}-01` } : {}) },
      business.timezone,
      now,
    );
  }

  /**
   * Recepción con sus líneas `PURCHASE_IN` (enlazadas por `refType`/`refId`).
   * El orden en que se enviaron no se guarda: las líneas salen por
   * `productId`, que es el orden en que las inserta el StockLedger.
   */
  async getReceipt(businessId: string, id: string): Promise<ReceiptBatchResult> {
    const scoped = forBusiness(this.prisma, businessId);
    const receipt = await scoped.inventoryReceipt.findFirst({
      where: { id },
      include: { supplier: RECEIPT_SUPPLIER_SELECT },
    });
    if (!receipt) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'RECEIPT_NOT_FOUND',
        title: 'Recepción no encontrada',
      });
    }
    const [movements, payable, timezone] = await Promise.all([
      scoped.inventoryMovement.findMany({
        where: { refType: RECEIPT_REF_TYPE, refId: id },
        orderBy: [{ productId: 'asc' }, { occurredAt: 'asc' }],
      }),
      scoped.supplierPayable.findFirst({
        where: { receiptId: id, voidedAt: null },
        include: PAYABLE_INCLUDE,
      }),
      this.timezoneOf(businessId),
    ]);
    return {
      receipt: receiptView(receipt),
      lines: movements.filter((m) => m.type === InventoryMovementType.PURCHASE_IN),
      adjustments: movements.filter((m) => m.type === InventoryMovementType.ADJUSTMENT),
      voids: movements.filter((m) => m.type === InventoryMovementType.PURCHASE_VOID),
      payable: payable ? payableView(payable, localDateString(new Date(), timezone)) : null,
      warnings: [],
    };
  }

  /**
   * Ajuste por cantidad física (R3, BR-P7b): el StockLedger calcula
   * `physicalQuantity − saldo` con la fila bloqueada y rechaza el producto
   * inactivo (DEC-51), sin conteo (DEC-48) o sin diferencia (DEC-49). No
   * marca `isCounted`. El motivo es obligatorio (BR-P10). Refleja el
   * estante, así que nunca se bloquea por saldo (DEC-26 aplica a las
   * salidas por consumo, no a las correcciones).
   */
  async adjustment(
    businessId: string,
    userId: string,
    dto: CreateAdjustmentDto,
  ): Promise<InventoryMovement> {
    return this.applyOne(businessId, userId, {
      productId: dto.productId,
      type: InventoryMovementType.ADJUSTMENT,
      physicalQuantity: dto.physicalQuantity,
      reason: dto.reason,
      occurredAt: new Date(),
    });
  }

  private async applyOne(
    businessId: string,
    userId: string,
    entry: StockEntry,
  ): Promise<InventoryMovement> {
    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const { movements } = await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        entries: [entry],
      });
      return movements[0]!;
    });
  }
}

/**
 * Forma del lote (06-API.md §2): de 1 a 100 líneas, cantidades > 0, montos
 * ≥ 0 con hasta 2 decimales (opcionales, DEC-90) y sin productos repetidos.
 * Se valida antes de tocar la base. Devuelve el total pagado de la recepción
 * (suma de las líneas con monto) o `null` si ninguna tiene monto.
 */
function validateReceiptBatch(input: ReceiptBatchInput): Prisma.Decimal | null {
  const { lines } = input;
  if (lines.length < 1 || lines.length > MAX_RECEIPT_LINES) {
    throw new ValidationProblemException([
      {
        field: 'lines',
        message: `La recepción debe tener entre 1 y ${MAX_RECEIPT_LINES} productos.`,
      },
    ]);
  }

  const errors: FieldError[] = [];
  lines.forEach((line, index) => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      errors.push({
        field: `lines.${index}.quantity`,
        message: 'La cantidad debe ser mayor que 0.',
      });
    }
    const cost = line.purchaseCost;
    if (
      cost != null &&
      (!Number.isFinite(cost) ||
        cost < 0 ||
        new Prisma.Decimal(String(cost)).decimalPlaces() > 2 ||
        cost > MAX_MONEY)
    ) {
      errors.push({
        field: `lines.${index}.purchaseCost`,
        message: 'El monto debe ser 0 o más, con hasta 2 decimales.',
      });
    }
  });
  if (errors.length > 0) {
    throw new ValidationProblemException(errors);
  }

  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (seen.has(line.productId)) {
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'DUPLICATE_PRODUCT_LINE',
        title: 'Un producto aparece más de una vez en la recepción',
        errors: [{ field: `lines.${index}.productId`, message: 'Producto repetido.' }],
      });
    }
    seen.add(line.productId);
  }

  const costs = lines.filter((line) => line.purchaseCost != null);
  if (costs.length === 0) return null;
  const total = costs.reduce(
    (sum, line) => sum.plus(new Prisma.Decimal(String(line.purchaseCost))),
    new Prisma.Decimal(0),
  );
  if (total.greaterThan(new Prisma.Decimal(String(MAX_MONEY)))) {
    throw new ValidationProblemException([{ field: 'lines', message: MAX_MONEY_MESSAGE }]);
  }
  return total;
}

/**
 * Compra al crédito (R8, DEC-98, BR-K7), antes de abrir la transacción:
 * proveedor y moneda obligatorios, todas las líneas con monto y total > 0. Sin
 * crédito no se admite vencimiento. El tipo de cambio de la compra solo en USD.
 * Devuelve la deuda que nacerá (o null).
 */
function validateCreditPurchase(
  input: ReceiptBatchInput,
  totalCost: Prisma.Decimal | null,
  occurredAt: Date,
  timezone: string,
  today: string,
): { purchaseDate: string; draft: PayableDraft } | null {
  if (input.purchaseExchangeRate !== undefined && input.currency !== 'USD') {
    throw new ValidationProblemException([
      {
        field: 'purchaseExchangeRate',
        message: 'El tipo de cambio de la compra solo aplica a compras en dólares.',
      },
    ]);
  }
  if (input.paymentTerms !== 'CREDIT') {
    if (input.dueDate !== undefined || input.dueDateReason !== undefined) {
      throw new ValidationProblemException([
        { field: 'dueDate', message: 'El vencimiento solo aplica a compras al crédito.' },
      ]);
    }
    return null;
  }
  const errors: FieldError[] = [];
  if (!input.supplierId) {
    errors.push({ field: 'supplierId', message: 'Elige el proveedor de la compra al crédito.' });
  }
  if (!input.currency) {
    errors.push({ field: 'currency', message: 'Elige la moneda de la deuda.' });
  }
  if (errors.length > 0) throw new ValidationProblemException(errors);
  const missing = input.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.purchaseCost === undefined || line.purchaseCost === null);
  if (missing.length > 0) {
    throw new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: 'CREDIT_LINE_COST_REQUIRED',
      title: 'En una compra al crédito todas las líneas llevan monto',
      errors: missing.map(({ index }) => ({
        field: `lines.${index}.purchaseCost`,
        message: 'Escribe el monto de este producto: la deuda es la suma de las líneas.',
      })),
    });
  }
  if (!totalCost || totalCost.lessThanOrEqualTo(0)) {
    throw new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: 'CREDIT_TOTAL_MUST_BE_POSITIVE',
      title: 'Una compra al crédito debe tener un total mayor que 0',
      detail: 'Si no hay nada que pagar, regístrala al contado.',
      errors: [
        { field: 'lines', message: 'El total de una compra al crédito debe ser mayor que 0.' },
      ],
    });
  }
  const purchaseDate = input.purchaseDate ?? localDateString(occurredAt, timezone);
  const draft = buildPayableDraft(
    {
      currency: input.currency!,
      amount: totalCost,
      amountSource: 'RECEIPT_LINES',
      purchaseDate,
      dueDate: input.dueDate,
      dueDateReason: input.dueDateReason,
      referenceExchangeRate: input.purchaseExchangeRate,
    },
    today,
  );
  return { purchaseDate, draft };
}

type ReceiptHeader = Omit<
  ReceiptView,
  'laterStockResolution' | 'possibleDuplicateAcknowledged' | 'purchaseInfoRecordedById'
>;

/** Cabecera para la lista: los datos de auditoría de R8 se ven en el detalle. */
function receiptHeader(receipt: ReceiptView): ReceiptHeader {
  const header: Partial<ReceiptView> = { ...receipt };
  delete header.laterStockResolution;
  delete header.possibleDuplicateAcknowledged;
  delete header.purchaseInfoRecordedById;
  return header as ReceiptHeader;
}

function receiptNotFound(): ProblemException {
  return new ProblemException({
    status: HttpStatus.NOT_FOUND,
    code: 'RECEIPT_NOT_FOUND',
    title: 'Recepción no encontrada',
  });
}

/** `Prisma.Decimal` (real) o number (fake de pruebas): ambos coercen bien con Number(). */
export function toStockView(product: {
  id: string;
  stockQuantity: Prisma.Decimal | number | null;
  isCounted: boolean | null;
}): StockView {
  return {
    productId: product.id,
    balance: Number(product.stockQuantity ?? 0),
    isCounted: Boolean(product.isCounted),
  };
}
