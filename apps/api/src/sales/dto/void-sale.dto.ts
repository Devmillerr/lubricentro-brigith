import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { MAX_SALE_TEXT, type VoidSaleInput } from '../sales.service';

/** `POST /sales/:id/void`: el motivo es obligatorio (BR-V7). */
export class VoidSaleDto implements VoidSaleInput {
  @ApiProperty({ maxLength: MAX_SALE_TEXT })
  @IsString({ message: 'Escribe el motivo de la anulación.' })
  @Matches(/\S/, { message: 'Escribe el motivo de la anulación.' })
  @MaxLength(MAX_SALE_TEXT, { message: `El motivo admite hasta ${MAX_SALE_TEXT} caracteres.` })
  reason!: string;
}
