import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/** Conteo físico; sirve para el stock inicial y para recontar (BR-P7). */
export class CreateCountDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'La cantidad contada, tal como está en el estante.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQuantity!: number;

  @ApiPropertyOptional({ description: 'ISO 8601. Por defecto, ahora.' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
