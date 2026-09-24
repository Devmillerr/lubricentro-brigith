import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { QueryBoolean } from '../../common/dto/query-boolean';

export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Busca por nombre, marca, código, viscosidad, presentación o vehículo compatible (texto del modelo o marca).',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtra por código exacto.' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Incluye los productos de sus subcategorías.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Sin este filtro devuelve activos e inactivos.' })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Marca exacta (sin distinguir mayúsculas).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: 'Viscosidad exacta (sin distinguir mayúsculas).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  viscosity?: string;

  @ApiPropertyOptional({ description: 'Presentación exacta (sin distinguir mayúsculas).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  presentation?: string;

  @ApiPropertyOptional({ description: 'true: solo productos sin precio de venta (pendientes).' })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  missingPrice?: boolean;

  @ApiPropertyOptional({ description: 'Agrega saldo y estado de conteo (BR-P8), desde la caché.' })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeStock?: boolean;
}
