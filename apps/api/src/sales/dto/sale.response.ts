import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, SaleLineKind, SaleSource, SaleStatus, type SaleLine } from '@prisma/client';
import { PageOf } from '../../common/openapi/page.dto';
import type { StockWarning } from '../../inventory/stock-ledger';
import type { CreateSaleResult, SaleSummary, SaleWithLines } from '../sales.service';

/**
 * Respuestas de ventas con los campos exactos de 06-API.md §2 "Ventas". Los
 * montos y cantidades son `Decimal` en Prisma y viajan como string, nunca
 * como float. `vehicleId` y `maintenanceId` solo los llena el cobro de un
 * mantenimiento (R6) y `washTypeId` solo las líneas `WASH` (lavado, R5); en
 * la venta de mostrador (`COUNTER`) son `null`. Existen desde R4 para que el
 * contrato no cambie.
 */
export class SaleLineResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    enum: SaleLineKind,
    enumName: 'SaleLineKind',
    description: 'PRODUCT en la venta de mostrador (COUNTER); WASH en un lavado (R5).',
  })
  kind!: SaleLineKind;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Producto de una línea PRODUCT. null en las líneas WASH.',
  })
  productId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Tipo de lavado de una línea WASH (R5). null en las líneas PRODUCT.',
  })
  washTypeId!: string | null;

  @ApiProperty({
    description:
      'Al momento de la venta: nombre del producto (PRODUCT) o del tipo de lavado (WASH).',
  })
  descriptionSnapshot!: string;

  @ApiProperty({ type: String, nullable: true })
  codeSnapshot!: string | null;

  @ApiProperty({ type: String, description: 'Decimal(12,3) serializado como string.' })
  quantity!: string;

  @ApiProperty({ type: String, description: 'Precio aplicado. Decimal(10,2) como string.' })
  unitPrice!: string;

  @ApiProperty({
    type: String,
    description: 'quantity × unitPrice, redondeado half-up a 2 decimales. Decimal como string.',
  })
  subtotal!: string;

  @ApiProperty({
    description:
      'Si la línea generó un SALE. false si el producto no controla stock y siempre en WASH.',
  })
  movesStock!: boolean;
}

class SaleHeaderResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SaleSource, enumName: 'SaleSource' })
  source!: SaleSource;

  @ApiProperty({ enum: SaleStatus, enumName: 'SaleStatus' })
  status!: SaleStatus;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  paymentMethod!: PaymentMethod;

  @ApiProperty({
    type: String,
    description: 'Suma de los subtotales, calculada en el servidor. Decimal como string.',
  })
  total!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Solo en el cobro de un mantenimiento (R6). null en mostrador y lavado.',
  })
  vehicleId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Solo en el cobro de un mantenimiento (R6). null en mostrador y lavado.',
  })
  maintenanceId!: string | null;

  @ApiProperty()
  createdById!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  voidedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  voidReason!: string | null;
}

/** `GET /sales/:id` y `POST /sales/:id/void`. */
export class SaleResponse extends SaleHeaderResponse {
  @ApiProperty({ type: [SaleLineResponse], description: 'Ordenadas por productId.' })
  lines!: SaleLineResponse[];
}

/** Aviso que no bloquea la venta (DEC-27). */
export class SaleWarningResponse {
  @ApiProperty({ enum: ['PRODUCT_NOT_COUNTED'], enumName: 'SaleWarningCode' })
  code!: 'PRODUCT_NOT_COUNTED';

  @ApiProperty()
  message!: string;

  @ApiProperty()
  productId!: string;
}

/** `POST /sales`: la venta más sus avisos. */
export class CreateSaleResponse extends SaleResponse {
  @ApiProperty({ type: [SaleWarningResponse] })
  warnings!: SaleWarningResponse[];
}

/** Elemento del historial: la cabecera sin las líneas, más cuántas tiene. */
export class SaleSummaryResponse extends SaleHeaderResponse {
  @ApiProperty({ description: 'Cantidad de líneas de la venta.' })
  lineCount!: number;
}

export class SaleSummaryPageResponse extends PageOf(SaleSummaryResponse) {}

function toSaleHeader(sale: Omit<SaleWithLines, 'lines'>): SaleHeaderResponse {
  return {
    id: sale.id,
    source: sale.source,
    status: sale.status,
    paymentMethod: sale.paymentMethod,
    total: sale.total.toString(),
    occurredAt: sale.occurredAt,
    note: sale.note,
    vehicleId: sale.vehicleId,
    maintenanceId: sale.maintenanceId,
    createdById: sale.createdById,
    createdAt: sale.createdAt,
    voidedAt: sale.voidedAt,
    voidReason: sale.voidReason,
  };
}

function toSaleLineResponse(line: SaleLine): SaleLineResponse {
  return {
    id: line.id,
    kind: line.kind,
    productId: line.productId,
    washTypeId: line.washTypeId,
    descriptionSnapshot: line.descriptionSnapshot,
    codeSnapshot: line.codeSnapshot,
    quantity: line.quantity.toString(),
    unitPrice: line.unitPrice.toString(),
    subtotal: line.subtotal.toString(),
    movesStock: line.movesStock,
  };
}

export function toSaleResponse(sale: SaleWithLines): SaleResponse {
  return { ...toSaleHeader(sale), lines: sale.lines.map(toSaleLineResponse) };
}

export function toCreateSaleResponse(result: CreateSaleResult): CreateSaleResponse {
  return {
    ...toSaleResponse(result.sale),
    // Con BLOCK, la falta de stock es un 422; el único aviso posible es PRODUCT_NOT_COUNTED.
    warnings: result.warnings.map((warning: StockWarning) => ({
      code: warning.code as 'PRODUCT_NOT_COUNTED',
      message: warning.message,
      productId: warning.productId,
    })),
  };
}

export function toSaleSummaryResponse(sale: SaleSummary): SaleSummaryResponse {
  return { ...toSaleHeader(sale), lineCount: sale.lineCount };
}
