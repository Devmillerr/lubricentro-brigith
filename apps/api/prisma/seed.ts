import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Semilla mínima de C0: el negocio Brigith con su usuario dueño, y un negocio
 * "demo" separado para pruebas (BR-G7). No siembra nada de dominio (productos,
 * mantenimientos, plantillas): eso depende de datos reales que aún no existen.
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

  await prisma.user.upsert({
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

  console.log('Seed de C0 completa: negocios "brigith" y "demo".');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
