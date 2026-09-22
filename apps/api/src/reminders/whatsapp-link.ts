/**
 * GAP CONOCIDO (BR-W5, [HIPÓTESIS] H-08, P-01 pendiente): la conversión a
 * formato internacional con el código de país del negocio queda sin
 * resolver hasta ver teléfonos reales. Esto NO implementa esa regla: solo
 * limpia espacios, guiones y paréntesis para que el teléfono, tal como está
 * guardado (BR-C8), sea válido en una URL `wa.me`. No agrega código de país
 * ni asume ningún formato. Revisar cuando P-01 esté resuelto.
 */
export function normalizePhoneForWhatsAppLink(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = normalizePhoneForWhatsAppLink(phone);
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${cleaned}${query}`;
}
