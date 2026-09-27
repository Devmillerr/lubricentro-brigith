import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { QueryBoolean } from '../../common/dto/query-boolean';

/** Mismo patrón que `/product-categories?includeInactive=` (DEC-64). */
export class ListWashTypesQueryDto {
  @ApiPropertyOptional({
    description:
      'true incluye los tipos y precios desactivados (Configuración). Por defecto solo activos (cobro).',
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}
