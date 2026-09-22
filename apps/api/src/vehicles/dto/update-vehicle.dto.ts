import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto';

export class UpdateVehicleDto extends PartialType(OmitType(CreateVehicleDto, ['id'] as const)) {
  @ApiPropertyOptional({ description: 'false para desactivar (BR-G5).' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
