import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementType, type InventoryMovement } from '@prisma/client';
import { PageOf } from '../../common/openapi/page.dto';
import type { StockView } from '../inventory.service';

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
