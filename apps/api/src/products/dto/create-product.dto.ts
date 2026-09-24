import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';

/**
 * Cada producto es una unidad de stock (BR-P15). `unit` es texto libre a
 * propósito: el vocabulario queda pendiente de DEC-22/P-07, pero el campo en
 * sí ya es parte de la estructura estable (05-DATABASE.md §3).
 */
export class CreateProductDto {
  @ApiPropertyOptional({ description: 'UUID opcional; si no se envía, lo genera el servidor.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Texto libre (C-10).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: 'Único por negocio si se envía (C-05).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Opcional, p. ej. "10W40" (BR-P19b).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  viscosity?: string;

  @ApiPropertyOptional({ description: 'Opcional, p. ej. "1.5 L" o "Balde" (BR-P19b).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  presentation?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description: 'Unidad en la que se cuenta y descuenta (BR-P15). Vocabulario libre.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unit!: string;

  @ApiPropertyOptional({ description: 'Opcional; ningún precio se asume (BR-P17).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ description: 'Por defecto true (BR-P16).', default: true })
  @IsOptional()
  @IsBoolean()
  tracksStock?: boolean;
}
