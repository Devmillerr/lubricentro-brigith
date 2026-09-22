/**
 * Mayúsculas, sin espacios ni guiones: para buscar y comparar placas (BR-C6).
 * La placa "como fue escrita" se conserva sin tocar en `Vehicle.plate`.
 */
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s-]+/g, '');
}
