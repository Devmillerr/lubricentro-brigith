import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** `?limit=&cursor=&month=` del historial de recepciones (DEC-94). */
export class ListReceiptsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Mes calendario YYYY-MM en la zona del negocio: solo las recepciones de ese mes. Sin él, todo el historial.',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener el formato YYYY-MM.' })
  month?: string;
}
