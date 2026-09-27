import { ApiProperty } from '@nestjs/swagger';
import type { WashPriceOption, WashType } from '@prisma/client';
import type { WashTypeWithPrices } from '../wash-types.service';

/**
 * Respuestas de la configuración de lavados (06-API.md §2, "Lavados"). Sin
 * `businessId`: siempre es el del usuario. `amount` es `Decimal` en Prisma y
 * viaja como string, igual que los montos de ventas.
 */
export class WashPriceOptionResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  washTypeId!: string;

  @ApiProperty({ type: String, description: 'Decimal(10,2) serializado como string.' })
  amount!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null: sin etiqueta (el dueño elige el monto al ver el vehículo).',
  })
  label!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class WashTypeResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  imageKey!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class WashTypeWithPricesResponse extends WashTypeResponse {
  @ApiProperty({
    type: [WashPriceOptionResponse],
    description:
      'Opciones de precio ordenadas por sortOrder. Sin includeInactive, solo las activas.',
  })
  prices!: WashPriceOptionResponse[];
}

export function toWashPriceOptionResponse(price: WashPriceOption): WashPriceOptionResponse {
  return {
    id: price.id,
    washTypeId: price.washTypeId,
    amount: price.amount.toString(),
    label: price.label,
    sortOrder: price.sortOrder,
    isActive: price.isActive,
    createdAt: price.createdAt,
    updatedAt: price.updatedAt,
  };
}

export function toWashTypeResponse(type: WashType): WashTypeResponse {
  return {
    id: type.id,
    name: type.name,
    imageKey: type.imageKey,
    sortOrder: type.sortOrder,
    isActive: type.isActive,
    createdAt: type.createdAt,
    updatedAt: type.updatedAt,
  };
}

export function toWashTypeWithPricesResponse(type: WashTypeWithPrices): WashTypeWithPricesResponse {
  return { ...toWashTypeResponse(type), prices: type.prices.map(toWashPriceOptionResponse) };
}
