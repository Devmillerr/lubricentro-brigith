import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class ReceiptsSummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Mes calendario YYYY-MM. Por defecto, el mes actual en la zona del negocio.',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener el formato YYYY-MM.' })
  month?: string;
}
