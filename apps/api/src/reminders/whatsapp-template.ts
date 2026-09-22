export interface TemplateVars {
  cliente?: string | null;
  placa: string;
  proximaFecha?: string | null;
  proximoKm?: number | null;
}

/**
 * El texto de la plantilla lo define Brigith; no se inventa ninguno (BR-W4,
 * BR-W3). Mientras esté vacía, el resultado es cadena vacía: el enlace abre
 * el chat sin mensaje.
 */
export function renderWhatsAppTemplate(
  template: string | null | undefined,
  vars: TemplateVars,
): string {
  if (!template) return '';
  return template
    .replaceAll('{cliente}', vars.cliente ?? '')
    .replaceAll('{placa}', vars.placa)
    .replaceAll('{proxima_fecha}', vars.proximaFecha ?? '')
    .replaceAll('{proximo_km}', vars.proximoKm != null ? String(vars.proximoKm) : '');
}
