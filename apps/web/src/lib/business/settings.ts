import type { Schemas } from '@/lib/api/client';

export type Business = Schemas['BusinessResponse'];
export type SettingsUpdate = Schemas['UpdateBusinessSettingsDto'];
export type DefaultDueRule = NonNullable<SettingsUpdate['defaultDueRuleWhenBoth']>;

/**
 * Ajustes que hoy cambian algo en la app. `insufficientStockPolicy`,
 * `currency` y `defaultCountryCode` existen en la API pero ninguna pantalla ni
 * cálculo los usa todavía, así que no se muestran (se agregan cuando tengan
 * efecto). Valores como texto; "" = sin definir (se envía `null`).
 */
export interface SettingsValues {
  whatsappTemplate: string;
  reminderLeadDays: string;
  defaultDueRuleWhenBoth: '' | DefaultDueRule;
}

export type SettingsField = keyof SettingsValues;

/**
 * Datos que se pueden insertar en el mensaje. `token` es lo que guarda y
 * reemplaza la API (`whatsapp-template.ts`); en pantalla se escribe con
 * `[label]`, que se lee como texto normal. `example` es lo que muestra la
 * vista previa.
 */
export const TEMPLATE_FIELDS = [
  { token: '{cliente}', label: 'Nombre del cliente', example: 'Juan Pérez' },
  { token: '{placa}', label: 'Placa', example: 'ABC-123' },
  { token: '{proxima_fecha}', label: 'Próxima fecha', example: '2026-11-15' },
  { token: '{proximo_km}', label: 'Próximo km', example: '55000' },
] as const;

/** Cómo se ve un dato dentro del mensaje en pantalla: "[Placa]". */
export function templatePlaceholder(field: (typeof TEMPLATE_FIELDS)[number]): string {
  return `[${field.label}]`;
}

/** Plantilla guardada → texto en pantalla ("{placa}" → "[Placa]"). */
export function templateForDisplay(template: string): string {
  return TEMPLATE_FIELDS.reduce(
    (text, field) => text.replaceAll(field.token, templatePlaceholder(field)),
    template,
  );
}

/** Texto en pantalla → plantilla que guarda la API ("[Placa]" → "{placa}"). */
export function templateForApi(text: string): string {
  return TEMPLATE_FIELDS.reduce(
    (result, field) => result.replaceAll(templatePlaceholder(field), field.token),
    text,
  );
}

/** El mensaje con datos de ejemplo, igual que lo arma la API para cada aviso. */
export function previewTemplate(text: string): string {
  return TEMPLATE_FIELDS.reduce(
    (result, field) => result.replaceAll(templatePlaceholder(field), field.example),
    text,
  );
}

export function toValues(business: Business): SettingsValues {
  return {
    whatsappTemplate: templateForDisplay(business.whatsappTemplate ?? ''),
    reminderLeadDays: business.reminderLeadDays != null ? String(business.reminderLeadDays) : '',
    // El contrato de lectura admite cualquier DueRule; la configuración solo ANY/ALL.
    defaultDueRuleWhenBoth:
      business.defaultDueRuleWhenBoth === 'ANY' || business.defaultDueRuleWhenBoth === 'ALL'
        ? business.defaultDueRuleWhenBoth
        : '',
  };
}

/** Sin espacios sobrantes al inicio y al final; vacío = null (sin definir). */
function textOrNull(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

/** Errores de formato antes de enviar (mismas reglas que el DTO de la API). */
export function validate(values: SettingsValues): Partial<Record<SettingsField, string>> {
  const errors: Partial<Record<SettingsField, string>> = {};
  const days = values.reminderLeadDays.trim();
  if (days && (!/^\d+$/.test(days) || !Number.isSafeInteger(Number(days)))) {
    errors.reminderLeadDays = 'Ingresa un número entero de días, 0 o más.';
  }
  return errors;
}

/**
 * Solo los campos que cambiaron respecto de lo guardado, para no reescribir
 * valores que el usuario no tocó. Un campo vaciado se envía como `null`
 * (vuelve a quedar sin definir).
 */
export function changedSettings(business: Business, values: SettingsValues): SettingsUpdate {
  const body: SettingsUpdate = {};
  const template = textOrNull(templateForApi(values.whatsappTemplate));
  if (template !== business.whatsappTemplate) body.whatsappTemplate = template;

  const days = values.reminderLeadDays.trim() ? Number(values.reminderLeadDays.trim()) : null;
  if (days !== business.reminderLeadDays) body.reminderLeadDays = days;

  const rule = values.defaultDueRuleWhenBoth || null;
  if (rule !== business.defaultDueRuleWhenBoth) body.defaultDueRuleWhenBoth = rule;

  return body;
}
