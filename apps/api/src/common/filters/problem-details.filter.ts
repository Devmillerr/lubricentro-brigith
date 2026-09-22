import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FieldError, ProblemException } from '../exceptions/problem.exception';

interface ProblemDetailsBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance: string;
  errors?: FieldError[];
}

const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE_VIOLATION',
};

/**
 * Convierte cualquier excepción en el formato "problem details" de 06-API.md §1.
 * Nunca deja escapar el detalle de un error 5xx no controlado.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toProblemDetails(exception, request.url);

    if (body.status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.status).json(body);
  }

  private toProblemDetails(exception: unknown, instance: string): ProblemDetailsBody {
    if (exception instanceof ProblemException) {
      return {
        type: 'about:blank',
        title: exception.title,
        status: exception.getStatus(),
        detail: exception.message,
        code: exception.code,
        instance,
        errors: exception.errors,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const detail =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);

      return {
        type: 'about:blank',
        title: exception.name.replace(/Exception$/, ''),
        status,
        detail: Array.isArray(detail) ? detail.join(', ') : detail,
        code: DEFAULT_CODE_BY_STATUS[status] ?? 'HTTP_ERROR',
        instance,
      };
    }

    return {
      type: 'about:blank',
      title: 'Error interno',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Ocurrió un error inesperado. Intenta de nuevo.',
      code: 'INTERNAL_ERROR',
      instance,
    };
  }
}
