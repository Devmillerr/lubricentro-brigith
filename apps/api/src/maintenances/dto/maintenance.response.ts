import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DueRule,
  MaintenanceStatus,
  type Maintenance,
  type MaintenanceItem,
  type MaintenanceType,
} from '@prisma/client';
import { ReminderResponse } from '../../reminders/dto/reminder.response';
import { SaleResponse, toSaleResponse } from '../../sales/dto/sale.response';
import type {
  MaintenanceDetail,
  MaintenanceWarning,
  VoidMaintenanceResult,
} from '../maintenances.service';

export class MaintenanceTypeResponse implements MaintenanceType {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class MaintenanceResponse implements Maintenance {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nulo en un mantenimiento sin vehículo (R6, DEC-73).',
  })
  vehicleId!: string | null;

  @ApiProperty()
  maintenanceTypeId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  performedAt!: Date;

  @ApiProperty({ type: Number, nullable: true })
  odometerKm!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  nextDueKm!: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextDueDate!: Date | null;

  @ApiProperty({ enum: DueRule, enumName: 'DueRule', nullable: true })
  dueRule!: DueRule | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: MaintenanceStatus, enumName: 'MaintenanceStatus' })
  status!: MaintenanceStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  voidedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  voidedById!: string | null;

  @ApiProperty({ type: String, nullable: true })
  voidReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** `quantity` es `Decimal` en Prisma y viaja como string en el JSON. */
export class MaintenanceItemResponse implements Omit<MaintenanceItem, 'quantity'> {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  maintenanceId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productNameSnapshot!: string;

  @ApiProperty({ type: String, nullable: true })
  productCodeSnapshot!: string | null;

  @ApiProperty({ type: String, description: 'Decimal(12,3) serializado como string.' })
  quantity!: string;
}

export class MaintenanceWithItemsResponse extends MaintenanceResponse {
  @ApiProperty({ type: [MaintenanceItemResponse] })
  items!: MaintenanceItemResponse[];
}

/** Detalle e historial: el mantenimiento con su cobro, si lo tiene (R6, B-156). */
export class MaintenanceDetailResponse extends MaintenanceWithItemsResponse {
  @ApiProperty({
    type: SaleResponse,
    nullable: true,
    description: 'Cobro del mantenimiento (activo o anulado), o `null` si no tiene (R6, DEC-69).',
  })
  sale!: SaleResponse | null;
}

/** Respuesta de la anulación (R6, B-156): el mantenimiento y su cobro, si lo tiene. */
export class VoidMaintenanceResponse {
  @ApiProperty({ type: MaintenanceResponse })
  maintenance!: MaintenanceResponse;

  @ApiProperty({
    type: SaleResponse,
    nullable: true,
    description: 'Cobro asociado, anulado junto con el mantenimiento, o `null` si no tenía.',
  })
  sale!: SaleResponse | null;
}

/**
 * El mantenimiento tal como sale del servicio (los `Decimal` se serializan
 * como string al responder), con su cobro ya en la forma de `SaleResponse`.
 */
export type MaintenanceDetailBody = Omit<MaintenanceDetail, 'sale'> & {
  sale: SaleResponse | null;
};

export function toMaintenanceDetailResponse(detail: MaintenanceDetail): MaintenanceDetailBody {
  return { ...detail, sale: detail.sale ? toSaleResponse(detail.sale) : null };
}

export function toVoidMaintenanceResponse(result: VoidMaintenanceResult): VoidMaintenanceResponse {
  return {
    maintenance: result.maintenance,
    sale: result.sale ? toSaleResponse(result.sale) : null,
  };
}

const WARNING_CODES = [
  'INSUFFICIENT_STOCK',
  'PRODUCT_NOT_COUNTED',
  'ODOMETER_LOWER_THAN_PREVIOUS',
  'NEXT_KM_NOT_ABOVE_CURRENT',
  'NEXT_DATE_BEFORE_PERFORMED',
] as const satisfies readonly MaintenanceWarning['code'][];

/** Aviso que no bloquea el guardado (BR-M7, BR-P8, BR-P12). */
export class MaintenanceWarningResponse implements MaintenanceWarning {
  @ApiProperty({ enum: WARNING_CODES, enumName: 'MaintenanceWarningCode' })
  code!: MaintenanceWarning['code'];

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional()
  productId?: string;

  @ApiPropertyOptional()
  balance?: number;

  @ApiPropertyOptional()
  requestedQuantity?: number;
}

/** `POST /maintenances`. */
export class CreateMaintenanceResponse {
  @ApiProperty({ type: MaintenanceWithItemsResponse })
  maintenance!: MaintenanceWithItemsResponse;

  @ApiProperty({ type: ReminderResponse, nullable: true })
  reminder!: ReminderResponse | null;

  @ApiProperty({
    type: SaleResponse,
    nullable: true,
    description: 'Cobro creado con el bloque `charge` (R6, DEC-72), o `null`.',
  })
  sale!: SaleResponse | null;

  @ApiProperty({ type: [MaintenanceWarningResponse] })
  warnings!: MaintenanceWarningResponse[];
}
