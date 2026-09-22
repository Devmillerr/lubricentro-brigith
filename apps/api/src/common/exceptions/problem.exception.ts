import { HttpException, HttpStatus } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

export interface ProblemExceptionOptions {
  status: HttpStatus;
  /** Código estable que el frontend puede usar para distinguir el caso (06-API.md §1). */
  code: string;
  title: string;
  detail?: string;
  errors?: FieldError[];
}

/**
 * Excepción base para el formato "problem details" acordado en 06-API.md §1:
 * `type`, `title`, `status`, `detail`, un `code` estable y `errors[]` por campo.
 * Lanzar esta clase (o una subclase) en vez de HttpException cuando el caso
 * de error necesite un `code` específico para el frontend.
 */
export class ProblemException extends HttpException {
  public readonly code: string;
  public readonly title: string;
  public readonly errors?: FieldError[];

  constructor(options: ProblemExceptionOptions) {
    super(options.detail ?? options.title, options.status);
    this.code = options.code;
    this.title = options.title;
    this.errors = options.errors;
  }
}

export class ValidationProblemException extends ProblemException {
  constructor(errors: FieldError[]) {
    super({
      status: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_ERROR',
      title: 'Los datos enviados no son válidos',
      errors,
    });
  }
}
