import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * PATCH de mantenimiento contra una anulación concurrente (hallazgo H3):
 * `update` lee el mantenimiento ACTIVE fuera de la transacción y escribe
 * después. Si entretanto otra transacción lo anula, la escritura condicionada
 * a `status = ACTIVE` no toca nada y responde 409 `MAINTENANCE_VOIDED`.
 *
 * La carrera se fuerza de forma determinista: una transacción toma la fila con
 * `FOR UPDATE`, el PATCH queda esperando ese bloqueo (ya pasó la lectura), la
 * transacción anula y confirma, y recién entonces el PATCH continúa.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan Postgres.',
  );
}
// Salvaguarda: estas pruebas escriben. Nunca contra una base que no sea de prueba.
if (!/\/[^/?]*_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test".');
}

const prisma = new PrismaService({
  get: () => url,
} as unknown as ConfigService<Env, true>);
const maintenances = new MaintenancesService(prisma);

let businessId: string;
let userId: string;
let vehicleId: string;
let maintenanceTypeId: string;

beforeAll(async () => {
  await prisma.$connect();
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `H3 ${suffix}`, slug: `h3-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'H3', username: `h3-${suffix}`, passwordHash: 'x' },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      businessId: business.id,
      createdById: user.id,
      plate: 'H3-001',
      plateNormalized: 'H3001',
    },
  });
  const type = await prisma.maintenanceType.create({
    data: { businessId: business.id, name: 'Cambio de aceite' },
  });
  businessId = business.id;
  userId = user.id;
  vehicleId = vehicle.id;
  maintenanceTypeId = type.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createMaintenance() {
  const { maintenance } = await maintenances.create(businessId, userId, {
    vehicleId,
    maintenanceTypeId,
    performedAt: new Date().toISOString(),
    notes: 'original',
  });
  return maintenance.id;
}

/** Espera a que alguna sesión de esta base quede bloqueada esperando una fila. */
async function waitForLockWait(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (row && Number(row.waiting) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('El PATCH nunca quedó esperando el bloqueo de la fila.');
}

describe('PATCH de mantenimiento vs. anulación concurrente (H3)', () => {
  it('ACTIVE → VOIDED mientras el PATCH espera: 409 MAINTENANCE_VOIDED y no se escribe nada', async () => {
    const id = await createMaintenance();
    let patch: Promise<unknown> | undefined;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "maintenances" WHERE "id" = ${id}::text FOR UPDATE`;
      // La lectura previa del PATCH ve ACTIVE (no bloquea); su escritura espera.
      patch = maintenances.update(businessId, id, { notes: 'después de anular' });
      patch.catch(() => undefined);
      await waitForLockWait();
      await tx.maintenance.update({
        where: { id },
        data: { status: 'VOIDED', voidedAt: new Date(), voidedById: userId, voidReason: 'H3' },
      });
    });

    await expect(patch).rejects.toMatchObject({
      code: 'MAINTENANCE_VOIDED',
      status: 409,
    });
    const after = await prisma.maintenance.findFirstOrThrow({ where: { id } });
    expect(after.status).toBe('VOIDED');
    expect(after.notes).toBe('original');
  });

  it('ya anulado antes del PATCH: 409 MAINTENANCE_VOIDED', async () => {
    const id = await createMaintenance();
    await maintenances.void(businessId, userId, id, { reason: 'H3 secuencial' });

    await expect(maintenances.update(businessId, id, { notes: 'x' })).rejects.toMatchObject({
      code: 'MAINTENANCE_VOIDED',
      status: 409,
    });
    const after = await prisma.maintenance.findFirstOrThrow({ where: { id } });
    expect(after.notes).toBe('original');
  });

  it('ACTIVE sin anulación: el PATCH sigue funcionando', async () => {
    const id = await createMaintenance();
    const updated = await maintenances.update(businessId, id, { notes: 'corregido' });
    expect(updated.notes).toBe('corregido');
    expect(updated.status).toBe('ACTIVE');
  });
});
