import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Nombre o teléfono: al menos uno (BR-C3; lo valida el servicio). El id lo
 * genera el servidor si no llega.
 */
export class CreateCustomerDto {
  @ApiPropertyOptional({ description: 'UUID opcional; si no se envía, lo genera el servidor.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
