import type { Schemas } from './client';

/** Formato "problem details" que devuelve la API (06-API.md §1), tomado del contrato. */
export type ProblemDetails = Schemas['ProblemDetailsDto'];

export type ClassifiedError =
  | { kind: 'network' }
  | { kind: 'validation'; errors: { field: string; message: string }[] }
  | { kind: 'session-expired' }
  | { kind: 'server'; detail: string }
  | { kind: 'client'; code: string; detail: string };

/**
 * Distingue error de red, de validación, de sesión vencida y de servidor
 * (04-ARCHITECTURE.md §9), para que cada pantalla decida qué hacer: reintentar,
 * marcar el campo, renovar sesión sin perder el formulario, o mostrar un
 * mensaje simple con reintento.
 */
export function classifyError(
  problem: ProblemDetails | undefined,
  networkError: boolean,
): ClassifiedError {
  if (networkError || !problem) {
    return { kind: 'network' };
  }
  if (problem.status === 401) {
    return { kind: 'session-expired' };
  }
  if (problem.status === 400 && problem.errors?.length) {
    return { kind: 'validation', errors: problem.errors };
  }
  if (problem.status >= 500) {
    return { kind: 'server', detail: problem.detail };
  }
  return { kind: 'client', code: problem.code, detail: problem.detail };
}

/** Mensaje simple para mostrar al usuario según el tipo de error (07-UI-UX.md §5). */
export function describeError(error: ClassifiedError): string {
  switch (error.kind) {
    case 'network':
      return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    case 'session-expired':
      return 'Tu sesión venció. Vuelve a iniciar sesión.';
    case 'validation':
      return 'Revisa los datos ingresados.';
    case 'server':
      return 'Ocurrió un problema en el servidor. Inténtalo de nuevo.';
    case 'client':
      return error.detail;
  }
}
