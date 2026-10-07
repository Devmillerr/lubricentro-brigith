/**
 * Valores del catálogo confirmados por el dueño (10-OPERACION-REAL.md §0.1 y
 * §0.4). Son **sugerencias** para elegir en vez de escribir (BR-P19b): no son
 * una lista cerrada ni crean productos. El dueño puede usar cualquier otro
 * valor, y los que ya usa aparecen solos en `GET /products/facets`.
 */
export const CATALOG_SUGGESTIONS = {
  brands: ['Repsol', 'Vistony', 'Valvoline'],
  viscosities: ['5W30', '10W30', '10W40', '20W50', '25W60', '80W90', '85W140', 'SAE90'],
  presentations: ['Litro', '1 L', '1.5 L', 'Balde', '200 ml', '8 oz', '300 ml', '120 ml', '85 g'],
  /**
   * Unidades de stock (BR-P15): "unidad" es la que ya usa el catálogo; galón
   * y litro, las de los aceites y fluidos que se venden sueltos (§0.4).
   */
  units: ['unidad', 'galón', 'litro'],
} as const;

/**
 * Una unidad es un nombre ("unidad", "galón", "litro"…), nunca solo un
 * número: "0" o "5" no dicen en qué se cuenta el stock (Fase 3, DEC-92).
 */
export const UNIT_PATTERN = /\p{L}/u;
export const UNIT_MESSAGE =
  'La unidad debe ser un nombre (p. ej. unidad, galón o litro), no un número.';

export function isValidUnit(unit: string | null | undefined): boolean {
  return typeof unit === 'string' && UNIT_PATTERN.test(unit);
}
