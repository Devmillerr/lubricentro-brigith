import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsUUID, MaxLength, NotEquals } from 'class-validator';

/** Ajuste manual: el motivo es obligatorio (BR-P10). */
export class CreateAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'Con signo: entra +, sale − (BR-P3).' })
  @Type(() => Number)
  @IsNumber()
  @NotEquals(0)
  quantityDelta!: number;

  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
