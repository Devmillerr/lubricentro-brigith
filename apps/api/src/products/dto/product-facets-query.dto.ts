import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ProductFacetsQueryDto {
  @ApiPropertyOptional({ description: 'Limita a una categoría y sus subcategorías.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
