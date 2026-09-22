import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Otras categorías se agregan desde la app; solo alta (BR-P18). */
export class CreateProductCategoryDto {
  @ApiPropertyOptional({ description: 'UUID opcional; si no se envía, lo genera el servidor.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;
}
