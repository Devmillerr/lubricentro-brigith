import { ApiProperty } from '@nestjs/swagger';
import {
  InventoryMovementType,
  type InventoryMovement,
  type InventoryReceipt,
} from '@prisma/client';
import { PageOf } from '../../common/openapi/page.dto';
import type {
  ReceiptLinePreview,
  ReceiptsMonthSummary,
  StockAlertProduct,
  StockAlerts,
  StockView,
} from '../inventory.service';
import type { ReceiptProductSummary } from '../receipt-summary';

export class StockViewResponse implements StockView {
  @ApiProperty()
  productId!: string;

  @ApiProperty({
    description: 'Saldo en caché del producto: igual a la suma de sus movimientos (BR-P3).',
  })
  balance!: number;

  @ApiProperty({ description: 'Tiene al menos un conteo (BR-P8).' })
  isCounted!: boolean;
}

type DecimalFields =
  'quantityDelta' | 'countedQuantity' | 'previousBalance' | 'resultingBalance' | 'purchaseCost';

/** Los campos `Decimal` de Prisma viajan como string en el JSON. */
export class InventoryMovementResponse implements Omit<InventoryMovement, DecimalFields> {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty({ enum: InventoryMovementType, enumName: 'InventoryMovementType' })
  type!: InventoryMovementType;

  @ApiProperty({ type: String, description: 'Decimal(12,3) serializado como string.' })
  quantityDelta!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal(12,3) serializado como string.',
  })
  countedQuantity!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal(12,3) serializado como string.',
  })
  previousBalance!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Saldo del producto justo después del movimiento (Decimal(12,3) como string). Nulo en movimientos anteriores a R1.',
  })
  resultingBalance!: string | null;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Solo en PURCHASE_IN de una recepción: total pagado por la línea (Decimal(10,2) como string). null = sin monto registrado (DEC-90).',
  })
  purchaseCost!: string | null;

  @ApiProperty({ type: String, nullable: true })
  refType!: string | null;

  @ApiProperty({ type: String, nullable: true })
  refId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Usuario que lo registró. Nulo en movimientos anteriores a R1.',
  })
  createdById!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: Date;
}

export class InventoryMovementPageResponse extends PageOf(InventoryMovementResponse) {}

/** Recepción en lote con sus líneas `PURCHASE_IN`, en el orden enviado (R3). */
export class InventoryReceiptResponse implements Omit<InventoryReceipt, 'totalCost'> {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Suma de los montos pagados de las líneas que lo tienen (Decimal(10,2) como string). null = ninguna línea tiene monto (DEC-90).',
  })
  totalCost!: string | null;

  @ApiProperty()
  createdById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: [InventoryMovementResponse] })
  lines!: InventoryMovementResponse[];
}

/** Elemento del historial de recepciones: cabecera y cantidad de líneas (R3). */
export class InventoryReceiptSummaryResponse implements Omit<InventoryReceiptResponse, 'lines'> {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Suma de los montos pagados de las líneas que lo tienen (Decimal(10,2) como string). null = ninguna línea tiene monto (DEC-90).',
  })
  totalCost!: string | null;

  @ApiProperty()
  createdById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'Cantidad de productos (líneas PURCHASE_IN) de la recepción.' })
  lineCount!: number;

  @ApiProperty({
    type: () => ReceiptLinePreviewResponse,
    isArray: true,
    description:
      'Hasta 3 líneas, por nombre de producto, para ver qué llegó sin abrir la recepción (DEC-94).',
  })
  preview!: ReceiptLinePreviewResponse[];
}

/** Línea de una recepción en el historial (DEC-94). */
export class ReceiptLinePreviewResponse implements ReceiptLinePreview {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Unidad de stock del producto (litro, unidad…).' })
  unit!: string;

  @ApiProperty({
    type: String,
    description: 'Cantidad recibida en la unidad del producto (Decimal como string).',
  })
  quantity!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Monto pagado por la línea (2 decimales). null = sin monto.',
  })
  purchaseCost!: string | null;
}

export class InventoryReceiptSummaryPageResponse extends PageOf(InventoryReceiptSummaryResponse) {}

/** Total comprado en un mes (DEC-90). */
export class ReceiptsMonthSummaryResponse implements ReceiptsMonthSummary {
  @ApiProperty({ description: 'Mes calendario, YYYY-MM.' })
  month!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Inicio incluido (UTC).' })
  from!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fin excluido (UTC).' })
  to!: Date;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ description: 'Recepciones del mes.' })
  receiptCount!: number;

  @ApiProperty({
    type: String,
    description: 'Suma de los montos pagados registrados (Decimal como string, 2 decimales).',
  })
  totalCost!: string;

  @ApiProperty({ description: 'Recepciones del mes sin ningún monto registrado.' })
  receiptsWithoutCost!: number;

  @ApiProperty({
    description: 'Líneas del mes sin monto, también de recepciones con monto parcial.',
  })
  linesWithoutCost!: number;

  @ApiProperty({
    type: () => ReceiptProductSummaryResponse,
    isArray: true,
    description:
      'Lo comprado de cada producto en el mes (DEC-94): primero lo que más se pagó; los productos sin monto al final.',
  })
  products!: ReceiptProductSummaryResponse[];
}

/** Lo comprado de un producto en un mes (DEC-94). Nada se estima. */
export class ReceiptProductSummaryResponse implements ReceiptProductSummary {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  brand!: string | null;

  @ApiProperty({
    description: 'Unidad de stock del producto: la cantidad va en ella, sin convertir.',
  })
  unit!: string;

  @ApiProperty({
    type: String,
    description: 'Suma de lo recibido, con o sin monto (Decimal como string).',
  })
  quantity!: string;

  @ApiProperty({ description: 'Recepciones distintas en las que llegó.' })
  receiptCount!: number;

  @ApiProperty({
    type: String,
    description:
      'Suma de los montos registrados (2 decimales). "0.00" si ninguna línea tiene monto.',
  })
  totalCost!: string;

  @ApiProperty({
    type: String,
    description: 'Cantidad recibida en líneas con monto: la base del costo unitario.',
  })
  quantityWithCost!: string;

  @ApiProperty({ description: 'Líneas sin monto: no entran al total ni al costo unitario.' })
  linesWithoutCost!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Costo por unidad de stock, calculado: totalCost / quantityWithCost (2 decimales). null si no hay monto.',
  })
  unitCost!: string | null;
}

/** Producto en una lista de alertas de stock (R3, BR-P19). */
export class StockAlertProductResponse implements StockAlertProduct {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ description: 'Saldo en caché del producto (0 en agotados, < 0 en negativos).' })
  balance!: number;
}

/**
 * Stock que requiere atención (R3, BR-P19, DEC-50): solo productos activos;
 * las listas solo incluyen productos con conteo, ordenadas por nombre.
 */
export class StockAlertsResponse implements StockAlerts {
  @ApiProperty({ type: [StockAlertProductResponse], description: 'Con conteo y saldo = 0.' })
  outOfStock!: StockAlertProductResponse[];

  @ApiProperty({ type: [StockAlertProductResponse], description: 'Con conteo y saldo < 0.' })
  negative!: StockAlertProductResponse[];

  @ApiProperty({
    description:
      'Productos activos que controlan stock y no tienen conteo inicial (su saldo no es confiable).',
  })
  notCountedCount!: number;
}
