import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Renombrar, mover, ordenar o desactivar una categoría desde Configuración (BR-P18). */
export class UpdateProductCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Nueva categoría padre (de primer nivel); null la vuelve de primer nivel.',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'false desactiva; solo si no tiene productos ni subcategorías activos.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
