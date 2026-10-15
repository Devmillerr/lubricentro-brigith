/** Misma normalización que la API (BR-C6): mayúsculas, sin espacios ni guiones. */
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Solo se ofrece registrar una placa nueva si lo escrito (ya normalizado)
 * parece placa: de 4 a 10 letras y números, con al menos una letra y un
 * número. Un nombre no es una placa, y un teléfono (solo números) tampoco.
 */
export function looksLikePlate(plate: string): boolean {
  return /^[A-Z0-9]{4,10}$/.test(plate) && /\d/.test(plate) && /[A-Z]/.test(plate);
}
