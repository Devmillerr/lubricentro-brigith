import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  PaymentMethod,
  Prisma,
  SaleLineKind,
  SaleSource,
  SaleStatus,
  type Product,
  type Sale,
  type SaleLine,
} from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
  type FieldError,
} from '../common/exceptions/problem.exception';
import {
  MAX_MONEY,
  MAX_MONEY_MESSAGE,
  MAX_QUANTITY,
  MAX_QUANTITY_MESSAGE,
} from '../common/decimal-limits';
import { paginate, type Page } from '../common/pagination';
import { applyStockMovements, type StockWarning } from '../inventory/stock-ledger';
import { forBusiness, type ScopedTransaction } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';

/** Límite de líneas por venta (06-API.md §2, "Ventas"). */
export const MAX_SALE_LINES = 50;
/** Máximo de caracteres de `note` y del motivo de anulación. */
export const MAX_SALE_TEXT = 500;
/** `refType` de los movimientos `SALE`/`SALE_VOID` que genera una venta. */
export const SALE_REF_TYPE = 'Sale';

/**
 * Endpoints con los que la capa HTTP registra la `Idempotency-Key` (mismo
 * patrón que `inventory/receipts` y `maintenances/:id/void`).
 */
export const SALE_IDEMPOTENCY_ENDPOINT = 'sales';
export function saleVoidIdempotencyEndpoint(saleId: string): string {
  return `sales/${saleId}/void`;
}

const QUANTITY_DECIMALS = 3;
const PRICE_DECIMALS = 2;

/**
 * Entrada de una venta de mostrador (R4). Tipo interno del dominio: el DTO
 * público con class-validator se agrega junto con el endpoint. Sin
 * `saleUnitId` (formas de venta fuera de R4) y sin total: lo calcula el
 * servidor.
 */
export interface CreateSaleInput {
  id?: string;
  paymentMethod: PaymentMethod;
  occurredAt?: string;
  note?: string;
  lines: { productId: string; quantity: number; unitPrice: number }[];
}

export interface SaleWithLines extends Sale {
  lines: SaleLine[];
}

export interface CreateSaleResult {
  sale: SaleWithLines;
  warnings: StockWarning[];
}

/** Elemento del historial: la cabecera y cuántas líneas tiene. */
export interface SaleSummary extends Sale {
  lineCount: number;
}

export interface ListSalesQuery {
  /** Incluido: `from ≤ occurredAt`. */
  from?: string;
  /** Excluido: `occurredAt < to`. */
  to?: string;
  source?: SaleSource;
  paymentMethod?: PaymentMethod;
  status?: SaleStatus;
  limit?: number;
  cursor?: string;
}

export interface VoidSaleInput {
  reason: string;
}

/**
 * Venta de mostrador (R4, 06-API.md §2 "Ventas"): todo ingreso es una `Sale`
 * (BR-V5). El stock lo mueve el StockLedger, nunca la línea: un `SALE` por
 * línea de un producto que controla stock, enlazado por `refType`/`refId`.
 * La idempotencia por `Idempotency-Key` la aplica la capa HTTP
 * (`IdempotencyService`), como en `POST /inventory/*` y en el mantenimiento.
 */
@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea la venta completa en una transacción, todo o nada:
   *
   * 1. La forma se valida antes de abrir la transacción (líneas, cantidades,
   *    precios, repetidos, nota).
   * 2. Se leen los productos: inexistente o de otro negocio → 404
   *    `PRODUCT_NOT_FOUND`; inactivo → 409 `PRODUCT_INACTIVE` (BR-P21). La
   *    lectura no bloquea filas.
   * 3. El StockLedger bloquea los productos que controlan stock y aplica
   *    `BLOCK` (DEC-26): si uno con conteo no alcanza, 422
   *    `INSUFFICIENT_STOCK` y no se escribe nada. Vuelve a exigir producto
   *    activo con la fila bloqueada. Sin conteo: se vende con el aviso
   *    `PRODUCT_NOT_COUNTED` (DEC-27). Los de `tracksStock = false` no pasan
   *    por el ledger (BR-V4).
   * 4. Recién después se crean la cabecera y las líneas: la FK de `SaleLine`
   *    hacia `products` toma un lock compartido, y pedirlo antes del
   *    `FOR UPDATE` del ledger podría trabar dos ventas entre sí.
   *
   * No lee `Business.insufficientStockPolicy`. Un `id` repetido falla en la
   * base con el error genérico, igual que la recepción de R3 (T4).
   */
  async create(
    businessId: string,
    userId: string,
    input: CreateSaleInput,
  ): Promise<CreateSaleResult> {
    const lines = validateCreateSale(input);

    const saleId = input.id ?? randomUUID();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: lines.map((line) => line.productId) } },
      });
      const productById = new Map(products.map((product) => [product.id, product]));
      assertSellable(lines, productById);

      const { warnings } = await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'BLOCK',
        insufficientStockField: 'lines',
        entries: lines
          .filter((line) => productById.get(line.productId)!.tracksStock)
          .map((line) => ({
            productId: line.productId,
            type: InventoryMovementType.SALE,
            quantityDelta: -line.quantity,
            requireActiveProduct: true,
            refType: SALE_REF_TYPE,
            refId: saleId,
            occurredAt,
          })),
      });

      const sale = await writeSale(tx, {
        businessId,
        userId,
        saleId,
        source: SaleSource.COUNTER,
        paymentMethod: input.paymentMethod,
        occurredAt,
        note: input.note,
        lines: lines.map((line) => {
          const product = productById.get(line.productId)!;
          return {
            kind: SaleLineKind.PRODUCT,
            productId: product.id,
            washTypeId: null,
            descriptionSnapshot: product.name,
            codeSnapshot: product.code ?? null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            subtotal: line.subtotal,
            movesStock: product.tracksStock,
          };
        }),
      });
      return { sale, warnings };
    });
  }

  /**
   * Historial de ventas, de la más reciente a la más antigua por
   * `occurredAt`, con `id` como desempate estable para el cursor. `from`
   * incluido y `to` excluido. Dos consultas por página: las cabeceras y un
   * `groupBy` que cuenta las líneas de todas a la vez.
   */
  async list(businessId: string, query: ListSalesQuery): Promise<Page<SaleSummary>> {
    const limit = query.limit ?? 20;
    const scoped = forBusiness(this.prisma, businessId);

    const where: Prisma.SaleWhereInput = {};
    if (query.from || query.to) {
      where.occurredAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    if (query.source) where.source = query.source;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.status) where.status = query.status;

    const rows = await scoped.sale.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = paginate(rows, limit);
    if (page.items.length === 0) return { items: [], nextCursor: page.nextCursor };

    const counts = await scoped.saleLine.groupBy({
      by: ['saleId'],
      where: { saleId: { in: page.items.map((sale) => sale.id) } },
      _count: { _all: true },
    });
    const countBySale = new Map(counts.map((c) => [c.saleId, c._count._all]));

    return {
      items: page.items.map((sale) => ({ ...sale, lineCount: countBySale.get(sale.id) ?? 0 })),
      nextCursor: page.nextCursor,
    };
  }

  /** Venta con sus líneas, ordenadas por `productId` (T5). */
  async get(businessId: string, id: string): Promise<SaleWithLines> {
    const scoped = forBusiness(this.prisma, businessId);
    const sale = await scoped.sale.findFirst({ where: { id } });
    if (!sale) throw saleNotFound();
    const lines = await scoped.saleLine.findMany({
      where: { saleId: id },
      orderBy: [{ productId: 'asc' }],
    });
    return { ...sale, lines };
  }

  /**
   * Anula una venta (BR-V7). En una transacción:
   *
   * 1. Pasa la venta de `ACTIVE` a `VOIDED` con una escritura condicional
   *    (T3). Si no cambió ninguna fila, ya estaba anulada: 409
   *    `SALE_ALREADY_VOIDED`. La escritura bloquea la fila, así que dos
   *    anulaciones simultáneas con claves distintas no generan dos
   *    `SALE_VOID`: la segunda espera y encuentra la venta ya anulada.
   * 2. Por cada línea con `movesStock = true`, un `SALE_VOID` que devuelve la
   *    cantidad al stock. Sin `requireActiveProduct`: se anula aunque el
   *    producto se haya desactivado después (BR-P21).
   *
   * La venta, sus líneas y sus movimientos originales no se borran ni se
   * editan (BR-G5).
   */
  async void(
    businessId: string,
    userId: string,
    id: string,
    input: VoidSaleInput,
  ): Promise<SaleWithLines> {
    const reason = validateVoidReason(input.reason);

    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const existing = await tx.sale.findFirst({ where: { id } });
      if (!existing) throw saleNotFound();
      // El cobro de un mantenimiento solo se anula con su mantenimiento
      // (R6, DEC-70), para no dejar un mantenimiento activo sin su venta.
      // `source` no cambia nunca, así que leerlo sin bloqueo es seguro.
      if (existing.source === SaleSource.MAINTENANCE) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'SALE_MANAGED_BY_MAINTENANCE',
          title: 'Este cobro se anula desde su mantenimiento',
          detail: 'Anula el mantenimiento: su cobro se anula con él.',
        });
      }

      const { count } = await tx.sale.updateMany({
        where: { id, status: SaleStatus.ACTIVE },
        data: {
          status: SaleStatus.VOIDED,
          voidedAt: new Date(),
          voidedById: userId,
          voidReason: reason,
        },
      });
      if (count === 0) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'SALE_ALREADY_VOIDED',
          title: 'La venta ya estaba anulada',
        });
      }

      const lines = await tx.saleLine.findMany({
        where: { saleId: id },
        orderBy: [{ productId: 'asc' }],
      });
      const occurredAt = new Date();
      await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        entries: lines
          .filter((line) => line.movesStock && line.productId)
          .map((line) => ({
            productId: line.productId!,
            type: InventoryMovementType.SALE_VOID,
            quantityDelta: Number(line.quantity),
            refType: SALE_REF_TYPE,
            refId: id,
            occurredAt,
          })),
      });

      const sale = await tx.sale.findFirst({ where: { id } });
      return { ...sale!, lines };
    });
  }
}

/**
 * Línea ya validada y con su subtotal, lista para escribirse. Los snapshots
 * los arma quien llama: el nombre y código del producto en mostrador; en el
 * lavado (R5), el nombre del tipo con `productId = null`, `washTypeId` y
 * `movesStock = false`.
 */
export interface SaleLineDraft {
  kind: SaleLineKind;
  productId: string | null;
  washTypeId: string | null;
  descriptionSnapshot: string;
  codeSnapshot: string | null;
  quantity: number;
  /** `number` en mostrador (lo envía el cliente); `Decimal` en el lavado (el `amount` de la opción). */
  unitPrice: number | Prisma.Decimal;
  subtotal: Prisma.Decimal;
  movesStock: boolean;
}

/**
 * Escribe la cabecera `ACTIVE` y sus líneas dentro de la transacción de quien
 * llama, con `total` = suma de los subtotales (nunca lo envía el cliente).
 * No toca el stock: si la operación lo mueve, el StockLedger va **antes**,
 * porque la FK de `SaleLine` hacia `products` toma un lock compartido (ver
 * `SalesService.create`). Devuelve las líneas leídas de la base, en el mismo
 * orden que el detalle (T5).
 */
export async function writeSale(
  tx: ScopedTransaction,
  params: {
    businessId: string;
    userId: string;
    saleId: string;
    source: SaleSource;
    paymentMethod: PaymentMethod;
    occurredAt: Date;
    note?: string;
    /** Solo el cobro de un mantenimiento (R6) los llena; nulos en mostrador y lavado. */
    maintenanceId?: string | null;
    vehicleId?: string | null;
    lines: SaleLineDraft[];
  },
): Promise<SaleWithLines> {
  const { businessId, saleId, lines } = params;
  const total = lines.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));

  const sale = await tx.sale.create({
    data: {
      id: saleId,
      // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
      businessId,
      source: params.source,
      status: SaleStatus.ACTIVE,
      paymentMethod: params.paymentMethod,
      total,
      occurredAt: params.occurredAt,
      note: params.note ?? null,
      maintenanceId: params.maintenanceId ?? null,
      vehicleId: params.vehicleId ?? null,
      createdById: params.userId,
    },
  });

  for (const line of lines) {
    await tx.saleLine.create({ data: { businessId, saleId, ...line } });
  }

  const saleLines = await tx.saleLine.findMany({
    where: { saleId },
    orderBy: [{ productId: 'asc' }],
  });
  return { ...sale, lines: saleLines };
}

interface PricedLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: Prisma.Decimal;
}

/**
 * Forma de la venta (06-API.md §2): de 1 a 50 líneas, un método de pago
 * (DEC-30), cantidad > 0 con hasta 3 decimales, precio ≥ 0 con hasta 2, nota
 * de hasta 500 y sin productos repetidos. Devuelve las líneas con su
 * subtotal: `quantity × unitPrice` redondeado half-up a 2 decimales.
 */
function validateCreateSale(input: CreateSaleInput): PricedLine[] {
  const errors: FieldError[] = [];
  if (!Object.values(PaymentMethod).includes(input.paymentMethod)) {
    errors.push({ field: 'paymentMethod', message: 'El método de pago debe ser CASH o YAPE.' });
  }
  if (input.note !== undefined && input.note.length > MAX_SALE_TEXT) {
    errors.push({ field: 'note', message: `La nota admite hasta ${MAX_SALE_TEXT} caracteres.` });
  }

  const { lines } = input;
  if (lines.length < 1 || lines.length > MAX_SALE_LINES) {
    errors.push({
      field: 'lines',
      message: `La venta debe tener entre 1 y ${MAX_SALE_LINES} productos.`,
    });
    throw new ValidationProblemException(errors);
  }

  lines.forEach((line, index) => {
    if (!isNumberWithDecimals(line.quantity, QUANTITY_DECIMALS) || line.quantity <= 0) {
      errors.push({
        field: `lines.${index}.quantity`,
        message: `La cantidad debe ser mayor que 0, con hasta ${QUANTITY_DECIMALS} decimales.`,
      });
    } else if (line.quantity > MAX_QUANTITY) {
      errors.push({ field: `lines.${index}.quantity`, message: MAX_QUANTITY_MESSAGE });
    }
    if (!isNumberWithDecimals(line.unitPrice, PRICE_DECIMALS) || line.unitPrice < 0) {
      errors.push({
        field: `lines.${index}.unitPrice`,
        message: `El precio no puede ser negativo y admite hasta ${PRICE_DECIMALS} decimales.`,
      });
    } else if (line.unitPrice > MAX_MONEY) {
      errors.push({ field: `lines.${index}.unitPrice`, message: MAX_MONEY_MESSAGE });
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
        title: 'Un producto aparece más de una vez en la venta',
        errors: [{ field: `lines.${index}.productId`, message: 'Producto repetido.' }],
      });
    }
    seen.add(line.productId);
  }

  // Subtotal y total son Decimal(10,2): una cantidad y un precio válidos por
  // separado pueden no caber multiplicados o sumados.
  const priced = lines.map((line) => ({
    ...line,
    subtotal: lineSubtotal(line.quantity, line.unitPrice),
  }));
  const maxMoney = new Prisma.Decimal(String(MAX_MONEY));
  priced.forEach((line, index) => {
    if (line.subtotal.greaterThan(maxMoney)) {
      errors.push({ field: `lines.${index}.subtotal`, message: MAX_MONEY_MESSAGE });
    }
  });
  const total = priced.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));
  if (errors.length === 0 && total.greaterThan(maxMoney)) {
    errors.push({
      field: 'total',
      message: `El total de la venta (S/ ${total.toFixed(2)}) supera el máximo por venta (S/ 99 999 999,99).`,
    });
  }
  if (errors.length > 0) {
    throw new ValidationProblemException(errors);
  }
  return priced;
}

/** `quantity × unitPrice`, redondeado half-up a 2 decimales (06-API.md §2). */
export function lineSubtotal(quantity: number, unitPrice: number): Prisma.Decimal {
  // Desde el texto del número, para no arrastrar el error binario del float.
  return new Prisma.Decimal(String(quantity))
    .times(new Prisma.Decimal(String(unitPrice)))
    .toDecimalPlaces(PRICE_DECIMALS, Prisma.Decimal.ROUND_HALF_UP);
}

function isNumberWithDecimals(value: number, maxDecimals: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    new Prisma.Decimal(String(value)).decimalPlaces() <= maxDecimals
  );
}

/** Todos los productos existen en el negocio y están activos (BR-P21). */
function assertSellable(lines: PricedLine[], productById: Map<string, Product>): void {
  for (const [index, line] of lines.entries()) {
    const product = productById.get(line.productId);
    if (!product) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'PRODUCT_NOT_FOUND',
        title: 'Producto no encontrado',
        errors: [{ field: `lines.${index}.productId`, message: 'El producto no existe.' }],
      });
    }
    if (!product.isActive) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'PRODUCT_INACTIVE',
        title: 'El producto está inactivo',
        errors: [{ field: `lines.${index}.productId`, message: 'El producto está inactivo.' }],
      });
    }
  }
}

/** Motivo obligatorio (BR-V7): sin texto → 400; hasta 500 caracteres. */
function validateVoidReason(reason: string | undefined): string {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length === 0) {
    throw new ValidationProblemException([
      { field: 'reason', message: 'Escribe el motivo de la anulación.' },
    ]);
  }
  if (trimmed.length > MAX_SALE_TEXT) {
    throw new ValidationProblemException([
      { field: 'reason', message: `El motivo admite hasta ${MAX_SALE_TEXT} caracteres.` },
    ]);
  }
  return trimmed;
}

function saleNotFound(): ProblemException {
  return new ProblemException({
    status: HttpStatus.NOT_FOUND,
    code: 'SALE_NOT_FOUND',
    title: 'Venta no encontrada',
  });
}
