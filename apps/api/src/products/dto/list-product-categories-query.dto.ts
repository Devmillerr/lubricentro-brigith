import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { QueryBoolean } from '../../common/dto/query-boolean';

export class ListProductCategoriesQueryDto {
  @ApiPropertyOptional({ description: 'true incluye las categorías desactivadas.' })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}
