import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedBrigithCatalog } from './seed-catalog';
import { seedBrigithWashes } from './seed-washes';

// Prisma 7 exige un driver adapter explícito (mismo motivo que
// `src/prisma/prisma.service.ts`); `new PrismaClient()` sin adapter falla.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Semilla de C0 (negocio Brigith con su usuario dueño, y un negocio "demo"
 * separado para pruebas, BR-G7), C4 (tipo "Cambio de aceite", BR-M13), R2
 * (catálogo confirmado de brigith: ver prisma/seed-catalog.ts) y R5 (tipos y
 * precios de lavado de brigith: ver prisma/seed-washes.ts). No siembra
 * aceites, fluidos, mantenimientos reales ni plantillas: dependen de datos
 * que el dueño todavía no dio (05-DATABASE.md §6).
 */
async function main() {
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error(
      'SEED_OWNER_PASSWORD no está definida. La contraseña del dueño nunca vive en el repositorio (04-ARCHITECTURE.md §6).',
    );
  }

  const brigith = await prisma.business.upsert({
    where: { slug: 'brigith' },
    update: {},
    create: {
      name: 'Brigith',
      slug: 'brigith',
      timezone: 'America/Lima',
    },
  });

  const passwordHash = await argon2.hash(ownerPassword, { type: argon2.argon2id });

  const owner = await prisma.user.upsert({
    where: { username: 'brigith' },
    update: {},
    create: {
      businessId: brigith.id,
      name: 'Brigith',
      username: 'brigith',
      passwordHash,
      role: 'OWNER',
    },
  });

  await prisma.business.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo',
      slug: 'demo',
      timezone: 'America/Lima',
    },
  });

  // R2: categorías (Lubricante y Filtro, BR-P18, más el árbol de DEC-37),
  // filtros y compatibilidades confirmadas. Solo en brigith; demo no se toca.
  const catalog = await seedBrigithCatalog(prisma, brigith.id, owner.id);

  // R5: tipos y precios de lavado confirmados (§0.3). Solo en brigith.
  const washes = await seedBrigithWashes(prisma, brigith.id);

  await prisma.maintenanceType.upsert({
    where: { businessId_name: { businessId: brigith.id, name: 'Cambio de aceite' } },
    update: {},
    create: { businessId: brigith.id, name: 'Cambio de aceite' },
  });

  console.log(
    `Seed completa: negocios "brigith" y "demo"; tipo "Cambio de aceite"; catálogo de brigith: ${catalog.categories} categorías, ${catalog.airFilters} filtros de aire, ${catalog.oilFilters} filtros de aceite y ${catalog.compatibilities} compatibilidades; ${washes.washTypes} tipos de lavado (${washes.washPricesCreated} precios nuevos).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
