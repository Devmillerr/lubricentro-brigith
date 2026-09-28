import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_QUANTITY, MAX_QUANTITY_MESSAGE } from '../../common/decimal-limits';

/** Conteo físico; sirve para el stock inicial y para recontar (BR-P7). */
export class CreateCountDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({
    description: 'La cantidad contada, tal como está en el estante.',
    maximum: MAX_QUANTITY,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  countedQuantity!: number;

  @ApiPropertyOptional({ description: 'ISO 8601. Por defecto, ahora.' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
