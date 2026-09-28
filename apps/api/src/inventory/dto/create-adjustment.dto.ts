import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_QUANTITY, MAX_QUANTITY_MESSAGE } from '../../common/decimal-limits';

/**
 * Ajuste por cantidad física (R3, BR-P7b, 06-API.md §2 "Cambios de R3"): se
 * envía lo que hay en el estante y el servidor calcula la diferencia con el
 * producto bloqueado. El motivo es obligatorio (BR-P10) y se guarda como
 * texto (DEC-39). Los mensajes van en español porque la web los muestra
 * junto al campo.
 */
export class CreateAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'El producto no es válido.' })
  productId!: string;

  @ApiProperty({
    description: 'Cantidad que hay en el estante. Mayor o igual que 0; admite decimales (litros).',
    minimum: 0,
    maximum: MAX_QUANTITY,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad física debe ser un número.' })
  @Min(0, { message: 'La cantidad física no puede ser negativa.' })
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  physicalQuantity!: number;

  @ApiProperty({ maxLength: 500 })
  @IsString({ message: 'El motivo debe ser texto.' })
  @Matches(/\S/, { message: 'El motivo del ajuste es obligatorio.' })
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres.' })
  reason!: string;
}
