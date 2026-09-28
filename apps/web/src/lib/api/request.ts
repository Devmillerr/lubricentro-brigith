import { classifyError, describeError, type ClassifiedError, type ProblemDetails } from './errors';

export interface ApiFailure {
  /** null: no hubo respuesta (error de red). */
  status: number | null;
  /** `code` estable de la API (06-API.md §1), p. ej. `PLATE_ALREADY_EXISTS`. */
  code: string | null;
  /** Mensajes por campo de un 400 de validación (`errors[]`), por nombre de campo. */
  fieldErrors: Record<string, string>;
  classified: ClassifiedError;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

/**
 * Mensaje para el usuario. `byCode` permite un texto propio por `code` de la
 * API; `notFound` se usa para cualquier 404 (el recurso no existe o es de otro
 * negocio, 06-API.md).
 */
export function failureMessage(
  failure: ApiFailure,
  { byCode = {}, notFound }: { byCode?: Record<string, string>; notFound?: string } = {},
): string {
  if (failure.code && byCode[failure.code]) return byCode[failure.code]!;
  if (failure.status === 404) return notFound ?? 'El registro ya no existe.';
  if (failure.status === 429) {
    // 07-UI-UX.md §5: sin reintento automático; el usuario reintenta a mano.
    return 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.';
  }
  if (failure.status === 400) return 'Revisa los datos ingresados.';
  return describeError(failure.classified);
}

function isProblem(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && 'status' in value && 'code' in value;
}

/**
 * Envuelve una llamada de `api` (openapi-fetch) y devuelve éxito o un error ya
 * clasificado. No hace la llamada: recibe la promesa, así el tipado de ruta,
 * parámetros y cuerpo sigue siendo el del contrato.
 */
export async function callApi<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ApiResult<T>> {
  try {
    const { data, error, response } = await request;
    if (response.ok) return { ok: true, data: data as T };

    const problem = isProblem(error) ? error : undefined;
    const fieldErrors: Record<string, string> = {};
    for (const fieldError of problem?.errors ?? []) {
      fieldErrors[fieldError.field] ??= fieldError.message;
    }
    return {
      ok: false,
      failure: {
        status: response.status,
        code: problem?.code ?? null,
        fieldErrors,
        classified: classifyError(problem, false),
      },
    };
  } catch {
    return {
      ok: false,
      failure: { status: null, code: null, fieldErrors: {}, classified: { kind: 'network' } },
    };
  }
}
