import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ProblemDetailsDto } from './problem-details.dto';

const DEFAULT_DESCRIPTION: Record<number, string> = {
  400: 'Datos inválidos',
  401: 'Sin sesión o token inválido',
  404: 'No encontrado',
  409: 'Conflicto',
  422: 'Regla de negocio',
};

/**
 * Documenta las respuestas de error de un endpoint con el formato "problem
 * details" y los `code` que puede devolver cada estado, p. ej.
 * `@ApiErrors({ 404: ['CUSTOMER_NOT_FOUND'] })`.
 */
export function ApiErrors(codesByStatus: Partial<Record<400 | 401 | 404 | 409 | 422, string[]>>) {
  return applyDecorators(
    ...Object.entries(codesByStatus).map(([status, codes]) =>
      ApiResponse({
        status: Number(status),
        type: ProblemDetailsDto,
        description: `${DEFAULT_DESCRIPTION[Number(status)] ?? 'Error'}. code: ${codes.join(', ')}`,
      }),
    ),
  );
}

/** Errores comunes a todo endpoint autenticado. */
export const AUTH_ERRORS = ['UNAUTHENTICATED', 'INVALID_TOKEN'];

/** Errores de validación de cuerpo, query o `:id` (ValidationPipe, ParseUUIDPipe). */
export const VALIDATION_ERRORS = ['VALIDATION_ERROR', 'BAD_REQUEST'];

/** Errores del mecanismo de idempotencia (04-ARCHITECTURE.md §7.3). */
export const IDEMPOTENCY_ERRORS = {
  400: ['IDEMPOTENCY_KEY_REQUIRED'],
  409: ['IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_KEY_IN_PROGRESS'],
};
