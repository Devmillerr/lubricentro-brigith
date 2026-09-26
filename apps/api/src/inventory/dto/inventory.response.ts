import { ApiProperty } from '@nestjs/swagger';
import {
  InventoryMovementType,
  type InventoryMovement,
  type InventoryReceipt,
} from '@prisma/client';
import { PageOf } from '../../common/openapi/page.dto';
import type { StockAlertProduct, StockAlerts, StockView } from '../inventory.service';

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

type DecimalFields = 'quantityDelta' | 'countedQuantity' | 'previousBalance' | 'resultingBalance';

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
export class InventoryReceiptResponse implements InventoryReceipt {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

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

  @ApiProperty()
  createdById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'Cantidad de productos (líneas PURCHASE_IN) de la recepción.' })
  lineCount!: number;
}

export class InventoryReceiptSummaryPageResponse extends PageOf(InventoryReceiptSummaryResponse) {}

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
