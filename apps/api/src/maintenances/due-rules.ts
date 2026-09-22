import type { DueRule } from '@prisma/client';

export type DueRuleResolution =
  | { ok: true; dueRule: DueRule | null }
  | { ok: false; reason: 'AMBIGUOUS_DUE_RULE' | 'INCOHERENT_DUE_RULE' };

export interface DueRuleInput {
  nextDueKm?: number | null;
  nextDueDate?: Date | null;
  dueRule?: DueRule | null;
  /** `Business.defaultDueRuleWhenBoth` (DEC-01). */
  businessDefaultDueRuleWhenBoth?: DueRule | null;
}

/**
 * Resuelve la regla de vencimiento de un mantenimiento (BR-M4, BR-M5, BR-M6):
 * - Sin km ni fecha: ninguna regla, es válido y no genera recordatorio.
 * - Solo uno de los dos: la regla se infiere (`KM` o `DATE`); si el cliente
 *   envía una regla distinta, es incoherente.
 * - Ambos: el usuario elige `ANY` o `ALL`; sin elección, se usa el default
 *   del negocio si existe; si no, es ambiguo (06-API.md: 400 con `dueRule`
 *   requerido).
 */
export function resolveDueRule(input: DueRuleInput): DueRuleResolution {
  const hasKm = input.nextDueKm != null;
  const hasDate = input.nextDueDate != null;

  if (!hasKm && !hasDate) {
    return { ok: true, dueRule: null };
  }

  if (hasKm && !hasDate) {
    if (input.dueRule && input.dueRule !== 'KM') {
      return { ok: false, reason: 'INCOHERENT_DUE_RULE' };
    }
    return { ok: true, dueRule: 'KM' };
  }

  if (hasDate && !hasKm) {
    if (input.dueRule && input.dueRule !== 'DATE') {
      return { ok: false, reason: 'INCOHERENT_DUE_RULE' };
    }
    return { ok: true, dueRule: 'DATE' };
  }

  // Ambos presentes (BR-M5): solo ANY o ALL.
  if (input.dueRule) {
    if (input.dueRule !== 'ANY' && input.dueRule !== 'ALL') {
      return { ok: false, reason: 'INCOHERENT_DUE_RULE' };
    }
    return { ok: true, dueRule: input.dueRule };
  }

  if (input.businessDefaultDueRuleWhenBoth) {
    return { ok: true, dueRule: input.businessDefaultDueRuleWhenBoth };
  }

  return { ok: false, reason: 'AMBIGUOUS_DUE_RULE' };
}
