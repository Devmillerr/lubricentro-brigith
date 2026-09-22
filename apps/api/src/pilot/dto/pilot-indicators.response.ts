import { ApiProperty } from '@nestjs/swagger';
import type { InventoryMovementType } from '@prisma/client';
import type { PilotIndicators } from '../pilot-indicators.service';

export class PilotAdoptionResponse {
  @ApiProperty({ description: 'BR-I1: mantenimientos no anulados en el período.' })
  activeMaintenances!: number;
}

export class PilotMaintenanceResponse {
  @ApiProperty({ description: 'BR-I2: mantenimientos activos con próximo km/fecha.' })
  maintenancesWithNextDue!: number;

  @ApiProperty({ description: 'BR-I2: avisos abiertos en WhatsApp (BR-R10).' })
  remindersOpenedInWhatsApp!: number;
}

export class MovementsByTypeResponse implements Record<InventoryMovementType, number> {
  @ApiProperty()
  COUNT!: number;

  @ApiProperty()
  PURCHASE_IN!: number;

  @ApiProperty()
  MAINTENANCE_USE!: number;

  @ApiProperty()
  MAINTENANCE_VOID!: number;

  @ApiProperty()
  ADJUSTMENT!: number;

  @ApiProperty()
  SALE!: number;

  @ApiProperty()
  SALE_VOID!: number;
}

export class PilotInventoryResponse {
  @ApiProperty({ type: MovementsByTypeResponse })
  movementsByType!: MovementsByTypeResponse;

  @ApiProperty()
  totalMovements!: number;

  @ApiProperty({ description: 'BR-I3: productos con conteo y algún movimiento en el período.' })
  productsCountedAndMovedInPeriod!: number;
}

/** BR-I1 a BR-I3. Sin umbrales: BR-I4 sigue pendiente. */
export class PilotIndicatorsResponse implements PilotIndicators {
  @ApiProperty({ type: String, nullable: true })
  from!: string | null;

  @ApiProperty({ type: String, nullable: true })
  to!: string | null;

  @ApiProperty({ type: PilotAdoptionResponse })
  adoption!: PilotAdoptionResponse;

  @ApiProperty({ type: PilotMaintenanceResponse })
  maintenance!: PilotMaintenanceResponse;

  @ApiProperty({ type: PilotInventoryResponse })
  inventory!: PilotInventoryResponse;
}
