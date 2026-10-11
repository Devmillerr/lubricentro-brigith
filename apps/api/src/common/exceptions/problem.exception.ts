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
  /**
   * Miembro de extensión (RFC 9457): datos del caso para que el frontend los
   * muestre, p. ej. los conteos posteriores de una recepción atrasada (R8).
   */
  data?: unknown;
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
  public readonly data?: unknown;

  constructor(options: ProblemExceptionOptions) {
    super(options.detail ?? options.title, options.status);
    this.code = options.code;
    this.title = options.title;
    this.errors = options.errors;
    this.data = options.data;
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
