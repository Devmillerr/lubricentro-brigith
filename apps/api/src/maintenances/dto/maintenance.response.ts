import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DueRule,
  MaintenanceStatus,
  type Maintenance,
  type MaintenanceItem,
  type MaintenanceType,
} from '@prisma/client';
import { ReminderResponse } from '../../reminders/dto/reminder.response';
import type { MaintenanceWarning } from '../maintenances.service';

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

  @ApiProperty()
  vehicleId!: string;

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

  @ApiProperty({ type: [MaintenanceWarningResponse] })
  warnings!: MaintenanceWarningResponse[];
}
