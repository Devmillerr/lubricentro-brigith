import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  type InventoryMovement,
  type InventoryReceipt,
} from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
  type FieldError,
} from '../common/exceptions/problem.exception';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate, type Page } from '../common/pagination';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import type { CreateCountDto } from './dto/create-count.dto';
import type { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { applyStockMovements, type StockEntry } from './stock-ledger';

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
  lines: { productId: string; quantity: number }[];
}

export interface ReceiptBatchResult {
  receipt: InventoryReceipt;
  lines: InventoryMovement[];
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

/** Elemento del historial de recepciones: la cabecera y cuántas líneas tiene. */
export interface ReceiptSummary extends InventoryReceipt {
  lineCount: number;
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
  ): Promise<ReceiptBatchResult> {
    validateReceiptBatch(input);

    const receiptId = input.id ?? randomUUID();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const { movements } = await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        entries: input.lines.map((line) => ({
          productId: line.productId,
          type: InventoryMovementType.PURCHASE_IN,
          quantityDelta: line.quantity,
          requireActiveProduct: true,
          refType: RECEIPT_REF_TYPE,
          refId: receiptId,
          occurredAt,
        })),
      });

      const receipt = await tx.inventoryReceipt.create({
        data: {
          id: receiptId,
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
          businessId,
          occurredAt,
          note: input.note ?? null,
          createdById: userId,
        },
      });

      // El ledger agrupa por producto: se devuelven en el orden de las líneas.
      const byProduct = new Map(movements.map((movement) => [movement.productId, movement]));
      return { receipt, lines: input.lines.map((line) => byProduct.get(line.productId)!) };
    });
  }

  /**
   * Historial de recepciones (R3), de la más reciente a la más antigua por
   * `occurredAt`, con `id` como desempate estable para el cursor. Dos
   * consultas por página, sin importar cuántas recepciones traiga: las
   * cabeceras y un `groupBy` que cuenta las líneas de todas a la vez.
   */
  async listReceipts(businessId: string, query: PaginationQueryDto): Promise<Page<ReceiptSummary>> {
    const limit = query.limit ?? 20;
    const scoped = forBusiness(this.prisma, businessId);

    const rows = await scoped.inventoryReceipt.findMany({
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = paginate(rows, limit);
    if (page.items.length === 0) return { items: [], nextCursor: page.nextCursor };

    const counts = await scoped.inventoryMovement.groupBy({
      by: ['refId'],
      where: { refType: RECEIPT_REF_TYPE, refId: { in: page.items.map((r) => r.id) } },
      _count: { _all: true },
    });
    const countByReceipt = new Map(counts.map((c) => [c.refId, c._count._all]));

    return {
      items: page.items.map((receipt) => ({
        ...receipt,
        lineCount: countByReceipt.get(receipt.id) ?? 0,
      })),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Recepción con sus líneas `PURCHASE_IN` (enlazadas por `refType`/`refId`).
   * El orden en que se enviaron no se guarda: las líneas salen por
   * `productId`, que es el orden en que las inserta el StockLedger.
   */
  async getReceipt(businessId: string, id: string): Promise<ReceiptBatchResult> {
    const scoped = forBusiness(this.prisma, businessId);
    const receipt = await scoped.inventoryReceipt.findFirst({ where: { id } });
    if (!receipt) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'RECEIPT_NOT_FOUND',
        title: 'Recepción no encontrada',
      });
    }
    const lines = await scoped.inventoryMovement.findMany({
      where: { refType: RECEIPT_REF_TYPE, refId: id },
      orderBy: [{ productId: 'asc' }],
    });
    return { receipt, lines };
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
 * Forma del lote (06-API.md §2): de 1 a 100 líneas, cantidades > 0 y sin
 * productos repetidos. Se valida antes de tocar la base.
 */
function validateReceiptBatch(input: ReceiptBatchInput): void {
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
