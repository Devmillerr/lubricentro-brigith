import { ApiPropertyOptional } from '@nestjs/swagger';
import { InsufficientStockPolicy } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Solo los 6 campos abiertos documentados (05-DATABASE.md §3, 06-API.md,
 * RF-20). No se inventa ninguna configuración nueva. Cada uno puede
 * enviarse explícitamente en `null` para volver a dejarlo sin definir
 * (salvo `insufficientStockPolicy`, que no es nulable en el schema).
 */
export class UpdateBusinessSettingsDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Nulo hasta P-13 (BR-W4): mientras esté vacía, el enlace abre el chat sin mensaje.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  whatsappTemplate?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    description:
      'Nulo hasta decidir (BR-R5, DEC-03): sin valor, corresponde avisar desde la fecha exacta.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  reminderLeadDays?: number | null;

  @ApiPropertyOptional({
    enum: ['ANY', 'ALL'],
    nullable: true,
    description:
      'Nulo hasta decidir (BR-M5, DEC-01). Solo ANY o ALL: con km y fecha juntos, no KM/DATE.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(['ANY', 'ALL'])
  defaultDueRuleWhenBoth?: 'ANY' | 'ALL' | null;

  @ApiPropertyOptional({
    enum: InsufficientStockPolicy,
    description: 'Provisional: ALLOW_WITH_WARNING (BR-P11, BR-P12, DEC-05).',
  })
  @IsOptional()
  @IsEnum(InsufficientStockPolicy)
  insufficientStockPolicy?: InsufficientStockPolicy;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Para el enlace de WhatsApp (BR-W5). A confirmar tras P-01.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(10)
  defaultCountryCode?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Moneda del negocio. Valor a confirmar en el seed (05-DATABASE.md).',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(10)
  currency?: string | null;
}
