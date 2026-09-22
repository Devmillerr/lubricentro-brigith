import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateVehicleModelDto } from './create-vehicle-model.dto';

export class UpdateVehicleModelDto extends PartialType(
  OmitType(CreateVehicleModelDto, ['id'] as const),
) {
  @ApiPropertyOptional({ description: 'false para desactivar (BR-G5).' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
