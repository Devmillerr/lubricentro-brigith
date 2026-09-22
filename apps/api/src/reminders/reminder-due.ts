import type { DueRule } from '@prisma/client';

export interface ReminderDueInput {
  dueRule: DueRule;
  dueDate: Date | null;
  dueKm: number | null;
  /** Último km conocido del vehículo (BR-R4): nunca se estima. */
  lastKnownKm: number | null;
  today: Date;
  /** `Business.reminderLeadDays`; nulo = avisar desde la fecha exacta (BR-R5). */
  reminderLeadDays: number | null;
}

export interface ReminderDueResult {
  due: boolean;
  dateReached: boolean;
  kmReached: boolean;
}

function atMidnight(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * "Corresponde avisar ahora" (BR-R3, BR-R4, BR-R6). Se calcula en la
 * consulta, nunca se guarda (05-DATABASE.md §3).
 */
export function checkReminderDue(input: ReminderDueInput): ReminderDueResult {
  const leadDays = input.reminderLeadDays ?? 0;
  let dateReached = false;
  if (input.dueDate) {
    const threshold = atMidnight(input.dueDate);
    threshold.setDate(threshold.getDate() - leadDays);
    dateReached = atMidnight(input.today) >= threshold;
  }

  // BR-R4: compara contra el último km conocido; nunca se estima. Un
  // recordatorio solo por km no se activa por sí solo mientras el vehículo
  // no vuelva (no hay un nuevo dato de km).
  const kmReached =
    input.dueKm != null && input.lastKnownKm != null && input.lastKnownKm >= input.dueKm;

  let due: boolean;
  switch (input.dueRule) {
    case 'DATE':
      due = dateReached;
      break;
    case 'KM':
      due = kmReached;
      break;
    case 'ANY':
      due = dateReached || kmReached;
      break;
    case 'ALL':
      due = dateReached && kmReached;
      break;
  }

  return { due, dateReached, kmReached };
}
