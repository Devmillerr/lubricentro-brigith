import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, SaleSource, SaleStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { ListSalesQuery } from '../sales.service';

/** `GET /sales?from=&to=&source=&paymentMethod=&status=&limit=&cursor=`. */
export class ListSalesQueryDto extends PaginationQueryDto implements ListSalesQuery {
  @ApiPropertyOptional({ description: 'ISO 8601, incluido: from ≤ occurredAt.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha "from" no es válida.' })
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601, excluido: occurredAt < to.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha "to" no es válida.' })
  to?: string;

  @ApiPropertyOptional({ enum: SaleSource, enumName: 'SaleSource' })
  @IsOptional()
  @IsEnum(SaleSource)
  source?: SaleSource;

  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    enum: SaleStatus,
    enumName: 'SaleStatus',
    description: 'Sin filtro: ambas.',
  })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;
}
