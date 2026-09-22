import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class PilotIndicatorsQueryDto {
  @ApiPropertyOptional({ description: 'ISO 8601. Sin límite inferior si se omite.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601. Sin límite superior si se omite.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
