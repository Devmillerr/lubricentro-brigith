import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Anulación de un mantenimiento. `reason` es obligatorio desde R6, tenga o no
 * cobro (DEC-71): la venta asociada se anula con este mismo motivo.
 */
export class VoidMaintenanceDto {
  @ApiProperty({ maxLength: 500 })
  @IsString({ message: 'El motivo debe ser texto.' })
  @Matches(/\S/, { message: 'Escribe el motivo de la anulación.' })
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres.' })
  reason!: string;
}
