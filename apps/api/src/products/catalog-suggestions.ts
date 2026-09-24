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
} as const;
