import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/**
 * Tipos y precios de lavado iniciales del negocio **brigith** (R5, B-145,
 * 10-OPERACION-REAL.md §0.3, BR-L6). Solo montos confirmados por el dueño;
 * nada se inventa:
 *
 * - Moto lineal y Camioneta tienen dos montos (S/8 o S/10; S/30 o S/40): el
 *   dueño elige uno al ver el vehículo. Sin etiqueta: sería un criterio
 *   inventado.
 * - Minibán, Combi y Moto carguera existen en el negocio pero todavía no tienen
 *   precio: se siembran activos y sin opciones de precio. No se pueden cobrar
 *   (`POST /washes` necesita una opción activa, DEC-55) hasta que el dueño
 *   agregue su precio desde Configuración → Tipos de lavado.
 *
 * `sortOrder` sigue el orden de la lista. No toca el negocio demo.
 *
 * Idempotente y sin pisar cambios hechos desde la app: el tipo se crea solo si
 * no existe (`update: {}`), y sus precios solo si el tipo todavía no tiene
 * ninguna opción (activa o no). Si el dueño renombra un tipo, volver a correr
 * la siembra crearía otro con el nombre original.
 */
export const WASH_CATALOG: { name: string; amounts: string[] }[] = [
  { name: 'Moto lineal', amounts: ['8', '10'] },
  { name: 'Tico', amounts: ['15'] },
  { name: 'Auto', amounts: ['15'] },
  { name: 'Mototaxi', amounts: ['15'] },
  { name: 'Camioneta', amounts: ['30', '40'] },
  { name: 'Furgón', amounts: ['30'] },
  // Sin precio hasta que el dueño lo defina.
  { name: 'Minibán', amounts: [] },
  { name: 'Combi', amounts: [] },
  { name: 'Moto carguera', amounts: [] },
];

export interface WashSeedSummary {
  washTypes: number;
  /** Opciones de precio creadas en esta corrida (0 si ya existían). */
  washPricesCreated: number;
}

export async function seedBrigithWashes(
  prisma: PrismaClient,
  businessId: string,
): Promise<WashSeedSummary> {
  let washPricesCreated = 0;

  for (const [typeIndex, entry] of WASH_CATALOG.entries()) {
    const type = await prisma.washType.upsert({
      where: { businessId_name: { businessId, name: entry.name } },
      update: {},
      create: { businessId, name: entry.name, sortOrder: typeIndex, isActive: true },
    });

    const existing = await prisma.washPriceOption.count({
      where: { businessId, washTypeId: type.id },
    });
    if (existing > 0) continue;

    for (const [priceIndex, amount] of entry.amounts.entries()) {
      await prisma.washPriceOption.create({
        data: {
          businessId,
          washTypeId: type.id,
          amount: new Prisma.Decimal(amount),
          label: null,
          sortOrder: priceIndex,
          isActive: true,
        },
      });
      washPricesCreated++;
    }
  }

  return { washTypes: WASH_CATALOG.length, washPricesCreated };
}
