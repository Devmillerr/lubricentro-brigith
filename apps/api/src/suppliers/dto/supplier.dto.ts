import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Supplier } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Proveedor (R8, DEC-95). Solo el nombre es obligatorio. */
export class CreateSupplierDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'Escribe el nombre del proveedor.' })
  @MaxLength(120, { message: 'El nombre admite hasta 120 caracteres.' })
  name!: string;

  @ApiPropertyOptional({
    maxLength: 20,
    description: 'RUC u otro documento. Se guarda en mayúsculas y sin espacios; único por negocio.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El documento debe ser texto.' })
  @MaxLength(20, { message: 'El documento admite hasta 20 caracteres.' })
  taxId?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El teléfono debe ser texto.' })
  @MaxLength(50, { message: 'El teléfono admite hasta 50 caracteres.' })
  phone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'La nota debe ser texto.' })
  @MaxLength(500, { message: 'La nota admite hasta 500 caracteres.' })
  note?: string;
}

/** Edición parcial. `isActive: false` lo desactiva (no se borra, BR-G5). */
export class UpdateSupplierDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'Escribe el nombre del proveedor.' })
  @MaxLength(120, { message: 'El nombre admite hasta 120 caracteres.' })
  name?: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El documento debe ser texto.' })
  @MaxLength(20, { message: 'El documento admite hasta 20 caracteres.' })
  taxId?: string | null;

  @ApiPropertyOptional({ maxLength: 50, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El teléfono debe ser texto.' })
  @MaxLength(50, { message: 'El teléfono admite hasta 50 caracteres.' })
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'La nota debe ser texto.' })
  @MaxLength(500, { message: 'La nota admite hasta 500 caracteres.' })
  note?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'El estado debe ser verdadero o falso.' })
  isActive?: boolean;
}

export class ListSuppliersQueryDto {
  @ApiPropertyOptional({
    description: 'true: incluye los desactivados. Por defecto, solo activos.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

export class SupplierResponse implements Supplier {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  taxId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdById!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
