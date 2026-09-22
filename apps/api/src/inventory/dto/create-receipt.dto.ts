import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

/** Ingreso de mercadería: solo producto, cantidad y fecha (BR-P6). */
export class CreateReceiptDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ description: 'ISO 8601. Por defecto, ahora.' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
