import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['id'] as const)) {
  @ApiPropertyOptional({ description: 'false para desactivar (BR-G5).' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
