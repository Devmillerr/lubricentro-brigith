import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StockQueryDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;
}
