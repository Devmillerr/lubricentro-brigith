import { ApiProperty } from '@nestjs/swagger';
import { DASHBOARD_PERIODS, type DashboardPeriodKind } from '../dashboard-period';

/** Respuesta de `GET /dashboard` (R7, 06-API.md §2 "Dashboard"). Montos: string decimal. */
export class DashboardPeriodResponse {
  @ApiProperty({ enum: DASHBOARD_PERIODS })
  kind!: DashboardPeriodKind;

  @ApiProperty({ example: '2026-09-28', description: 'Fecha local pedida (o hoy).' })
  date!: string;

  @ApiProperty({ description: 'Inicio incluido, UTC (00:00 local del primer día).' })
  from!: string;

  @ApiProperty({ description: 'Fin excluido, UTC (00:00 local del día siguiente al último).' })
  to!: string;

  @ApiProperty({ example: 'America/Lima', description: 'Zona horaria del negocio.' })
  timezone!: string;
}

export class DashboardBySourceResponse {
  @ApiProperty({ description: 'Ventas de mostrador (COUNTER).' })
  counter!: string;

  @ApiProperty({ description: 'Lavados (WASH).' })
  wash!: string;

  @ApiProperty({ description: 'Cobros de mantenimiento (MAINTENANCE), por la hora del cobro.' })
  maintenance!: string;
}

export class DashboardTotalsResponse {
  @ApiProperty({ description: 'Suma de las ventas ACTIVE del período.' })
  total!: string;

  @ApiProperty()
  cash!: string;

  @ApiProperty()
  yape!: string;

  @ApiProperty({ description: 'Ventas ACTIVE de todos los orígenes.' })
  salesCount!: number;

  @ApiProperty({ type: DashboardBySourceResponse })
  bySource!: DashboardBySourceResponse;
}

export class DashboardWashTypeResponse {
  @ApiProperty({ type: String, nullable: true })
  washTypeId!: string | null;

  @ApiProperty({ description: 'Nombre actual del tipo.' })
  name!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  amount!: string;
}

export class DashboardWashesResponse {
  @ApiProperty()
  count!: number;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ type: [DashboardWashTypeResponse] })
  byType!: DashboardWashTypeResponse[];
}

export class DashboardMaintenancesResponse {
  @ApiProperty({ description: 'Mantenimientos ACTIVE por fecha del servicio (performedAt).' })
  count!: number;

  @ApiProperty({ description: 'Con cobro vigente. count = charged + uncharged.' })
  charged!: number;

  @ApiProperty({ description: 'Sin cobro (recordatorio, no error).' })
  uncharged!: number;
}

export class DashboardSeriesPointResponse {
  @ApiProperty({
    description: 'Inicio del punto (UTC): una hora (today) o un día local (week, month).',
  })
  bucket!: string;

  @ApiProperty()
  counter!: string;

  @ApiProperty()
  wash!: string;

  @ApiProperty()
  maintenance!: string;
}

export class DashboardResponse {
  @ApiProperty({ type: DashboardPeriodResponse })
  period!: DashboardPeriodResponse;

  @ApiProperty({ type: DashboardTotalsResponse })
  totals!: DashboardTotalsResponse;

  @ApiProperty({ type: DashboardWashesResponse })
  washes!: DashboardWashesResponse;

  @ApiProperty({ type: DashboardMaintenancesResponse })
  maintenances!: DashboardMaintenancesResponse;

  @ApiProperty({ type: [DashboardSeriesPointResponse] })
  series!: DashboardSeriesPointResponse[];
}
