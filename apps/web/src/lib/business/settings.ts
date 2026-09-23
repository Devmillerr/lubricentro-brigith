import type { Schemas } from '@/lib/api/client';

export type Business = Schemas['BusinessResponse'];
export type SettingsUpdate = Schemas['UpdateBusinessSettingsDto'];
export type StockPolicy = Schemas['InsufficientStockPolicy'];
export type DefaultDueRule = NonNullable<SettingsUpdate['defaultDueRuleWhenBoth']>;

/** Valores del formulario como texto; "" = sin definir (se envía `null`). */
export interface SettingsValues {
  whatsappTemplate: string;
  reminderLeadDays: string;
  defaultDueRuleWhenBoth: '' | DefaultDueRule;
  insufficientStockPolicy: StockPolicy;
  currency: string;
  defaultCountryCode: string;
}

export type SettingsField = keyof SettingsValues;

/** Variables que reemplaza la API al armar el mensaje (`whatsapp-template.ts`). */
export const TEMPLATE_VARIABLES = ['{cliente}', '{placa}', '{proxima_fecha}', '{proximo_km}'];

/** BR-P11: qué pasa al guardar un mantenimiento que dejaría stock negativo. */
export const STOCK_POLICY_LABELS: Record<StockPolicy, string> = {
  ALLOW_WITH_WARNING: 'Guardar y avisar',
  BLOCK: 'No guardar',
};

export function toValues(business: Business): SettingsValues {
  return {
    whatsappTemplate: business.whatsappTemplate ?? '',
    reminderLeadDays: business.reminderLeadDays != null ? String(business.reminderLeadDays) : '',
    // El contrato de lectura admite cualquier DueRule; la configuración solo ANY/ALL.
    defaultDueRuleWhenBoth:
      business.defaultDueRuleWhenBoth === 'ANY' || business.defaultDueRuleWhenBoth === 'ALL'
        ? business.defaultDueRuleWhenBoth
        : '',
    insufficientStockPolicy: business.insufficientStockPolicy,
    currency: business.currency ?? '',
    defaultCountryCode: business.defaultCountryCode ?? '',
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
  const template = textOrNull(values.whatsappTemplate);
  if (template !== business.whatsappTemplate) body.whatsappTemplate = template;

  const days = values.reminderLeadDays.trim() ? Number(values.reminderLeadDays.trim()) : null;
  if (days !== business.reminderLeadDays) body.reminderLeadDays = days;

  const rule = values.defaultDueRuleWhenBoth || null;
  if (rule !== business.defaultDueRuleWhenBoth) body.defaultDueRuleWhenBoth = rule;

  if (values.insufficientStockPolicy !== business.insufficientStockPolicy) {
    body.insufficientStockPolicy = values.insufficientStockPolicy;
  }

  const currency = textOrNull(values.currency);
  if (currency !== business.currency) body.currency = currency;

  const countryCode = textOrNull(values.defaultCountryCode);
  if (countryCode !== business.defaultCountryCode) body.defaultCountryCode = countryCode;

  return body;
}
