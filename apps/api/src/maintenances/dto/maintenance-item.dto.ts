import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsUUID, Max } from 'class-validator';
import { MAX_QUANTITY, MAX_QUANTITY_MESSAGE } from '../../common/decimal-limits';

/** Producto usado, cantidad > 0 (BR-M8). */
export class MaintenanceItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ maximum: MAX_QUANTITY })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  quantity!: number;
}
