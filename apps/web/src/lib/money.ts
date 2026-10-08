/**
 * Formato único de los importes visibles (2026-10-08): "S/ 25,474.50", con
 * coma de miles y punto decimal, en todas las pantallas. Solo presenta: no
 * cambia cómo se guardan ni cómo se calculan los montos. Los inputs de precio
 * no pasan por aquí (llevan el número sin miles, ver `priceInput`).
 */

/**
 * Monto decimal de la API ("123.40") a céntimos enteros, sin pasar por float:
 * los montos viajan como string (06-API.md §1) y así se suman y comparan exactos.
 */
export function toCents(amount: string): number {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith('-');
  const [whole = '0', fraction = ''] = trimmed.replace(/^[-+]/, '').split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return negative ? -cents : cents;
}

/** Céntimos a "S/ 1,234.50". */
export function formatCentsMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}S/ ${whole}.${fraction}`;
}

/**
 * Monto de la API (string decimal) o ya calculado (número) a "S/ 1,234.50".
 * Redondea a 2 decimales igual que antes (`toFixed(2)`); un valor que no es
 * número se muestra tal cual.
 */
export function formatMoney(amount: string | number): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return `S/ ${amount}`;
  return formatCentsMoney(toCents(value.toFixed(2)));
}
