import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

export class UpdateCustomerDto extends PartialType(OmitType(CreateCustomerDto, ['id'] as const)) {
  @ApiPropertyOptional({ description: 'false para desactivar (BR-G5).' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
