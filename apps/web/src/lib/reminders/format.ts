import type { Schemas } from '@/lib/api/client';

export type ReminderListItem = Schemas['ReminderListItemResponse'];
export type ReminderDetail = Schemas['ReminderDetailResponse'];
export type ReminderStatus = Schemas['ReminderStatus'];
export type ReminderReason = Schemas['ReminderReason'];
export type DueFilter = 'now' | 'upcoming' | 'all';

/** Estados (BR-R7). */
export const STATUS_LABELS: Record<ReminderStatus, string> = {
  PENDING: 'Pendiente',
  CONTACTED: 'Contactado',
  DONE: 'Cumplido',
  DISMISSED: 'Descartado',
};

/** Motivos de la lista "Avisar" (07-UI-UX.md §3.4). */
export const REASON_LABELS: Record<ReminderReason, string> = {
  DATE_REACHED: 'Fecha alcanzada',
  KM_REACHED_BY_LAST_KNOWN: 'Km alcanzado según el último km conocido',
  NO_PHONE: 'Sin teléfono',
};

export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  now: 'Corresponde avisar',
  upcoming: 'Próximos',
  all: 'Todos',
};

export function isOpen(status: ReminderStatus): boolean {
  return status === 'PENDING' || status === 'CONTACTED';
}
