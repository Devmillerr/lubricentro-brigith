import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VehicleLookupQueryDto {
  @ApiProperty({ description: 'Placa completa o parcial; se normaliza para comparar (BR-C6).' })
  @IsString()
  @IsNotEmpty()
  plate!: string;
}
