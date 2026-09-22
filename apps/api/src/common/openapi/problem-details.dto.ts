import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FieldError } from '../exceptions/problem.exception';

export class FieldErrorDto implements FieldError {
  @ApiProperty()
  field!: string;

  @ApiProperty()
  message!: string;
}

/** Cuerpo de todo error de la API (06-API.md §1, `ProblemDetailsFilter`). */
export class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  status!: number;

  @ApiProperty()
  detail!: string;

  @ApiProperty({ description: 'Código estable para distinguir el caso en el frontend.' })
  code!: string;

  @ApiProperty()
  instance!: string;

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  errors?: FieldErrorDto[];
}
