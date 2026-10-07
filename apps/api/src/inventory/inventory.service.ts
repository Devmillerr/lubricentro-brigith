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
  /** `purchaseCost`: total pagado por la línea, opcional (DEC-90). */
  lines: { productId: string; quantity: number; purchaseCost?: number | null }[];
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
export interface ReceiptSummary extends InventoryReceipt {
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
  /** Suma de `totalCost` (Decimal como string, 2 decimales). */
  totalCost: string;
  /** Recepciones del mes sin ningún monto registrado. */
  receiptsWithoutCost: number;
  /** Líneas del mes sin monto (incluye las de recepciones con monto parcial). */
  linesWithoutCost: number;
  /** Lo comprado de cada producto en el mes (DEC-94). */
  products: ReceiptProductSummary[];
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
    const totalCost = validateReceiptBatch(input);

    const receiptId = input.id ?? randomUUID();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const { movements } = await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        insufficientStockField: 'lines',
        entries: input.lines.map((line) => ({
          productId: line.productId,
          type: InventoryMovementType.PURCHASE_IN,
          quantityDelta: line.quantity,
          purchaseCost: line.purchaseCost ?? undefined,
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
          totalCost,
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
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = paginate(rows, limit);
    if (page.items.length === 0) return { items: [], nextCursor: page.nextCursor };

    const lines = await scoped.inventoryMovement.findMany({
      where: { refType: RECEIPT_REF_TYPE, refId: { in: page.items.map((r) => r.id) } },
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
          ...receipt,
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
    const where = { occurredAt: { gte: period.from, lt: period.to } };
    const [totals, receiptsWithoutCost, receipts] = await Promise.all([
      scoped.inventoryReceipt.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalCost: true },
      }),
      scoped.inventoryReceipt.count({ where: { ...where, totalCost: null } }),
      scoped.inventoryReceipt.findMany({ where, select: { id: true } }),
    ]);
    const lines =
      receipts.length === 0
        ? []
        : await scoped.inventoryMovement.findMany({
            where: {
              refType: RECEIPT_REF_TYPE,
              refId: { in: receipts.map((receipt) => receipt.id) },
            },
            include: { product: true },
          });
    return {
      month: period.date.slice(0, 7),
      from: period.from,
      to: period.to,
      timezone: period.timezone,
      receiptCount: totals._count._all,
      totalCost: new Prisma.Decimal(totals._sum.totalCost ?? 0).toFixed(2),
      receiptsWithoutCost,
      linesWithoutCost: lines.filter((line) => line.purchaseCost === null).length,
      products: summarizeReceiptLinesByProduct(lines),
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
