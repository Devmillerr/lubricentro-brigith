import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { DASHBOARD_PERIODS, type DashboardPeriodKind } from '../dashboard-period';
import type { DashboardQuery } from '../dashboard.service';

/** `GET /dashboard?period=today|week|month&date=YYYY-MM-DD` (R7, DEC-78, DEC-79). */
export class DashboardQueryDto implements DashboardQuery {
  @ApiPropertyOptional({
    enum: DASHBOARD_PERIODS,
    default: 'today',
    description:
      'today: el día; week: lunes a domingo que contiene `date`; month: su mes calendario.',
  })
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS, { message: 'El período debe ser today, week o month.' })
  period?: DashboardPeriodKind;

  @ApiPropertyOptional({
    example: '2026-09-28',
    description: 'Fecha local en la zona horaria del negocio. Por defecto, hoy en esa zona.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date?: string;
}
