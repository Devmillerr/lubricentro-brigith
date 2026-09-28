import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { UpdateMaintenanceDto } from '../../src/maintenances/dto/update-maintenance.dto';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Mantenimiento sin vehículo contra Postgres real (R6, B-151/B-152, DEC-73):
 * la columna `maintenances.vehicleId` nullable, la FK que sigue en `RESTRICT`
 * y la regla de rechazo de los campos de seguimiento al crear y al corregir.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas (en CI: el
 * Postgres del workflow). Cada corrida crea su propio negocio.
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
    data: { name: `R6 ${suffix}`, slug: `r6-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'R6', username: `r6-${suffix}`, passwordHash: 'x' },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      businessId: business.id,
      createdById: user.id,
      plate: 'R6-001',
      plateNormalized: 'R6001',
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

describe('Mantenimiento sin vehículo contra Postgres (R6, DEC-73)', () => {
  it('se guarda con vehicleId NULL, sin recordatorio y sin cerrar el de otro vehículo', async () => {
    const withVehicle = await maintenances.create(businessId, userId, {
      vehicleId,
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
      nextDueKm: 15000,
    });

    const withoutVehicle = await maintenances.create(businessId, userId, {
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
      notes: 'Sin vehículo',
    });

    const stored = await prisma.maintenance.findFirstOrThrow({
      where: { id: withoutVehicle.maintenance.id },
    });
    expect(stored.vehicleId).toBeNull();
    expect(stored).toMatchObject({
      odometerKm: null,
      nextDueKm: null,
      nextDueDate: null,
      dueRule: null,
    });
    expect(withoutVehicle.reminder).toBeNull();
    expect(
      await prisma.reminder.count({
        where: { sourceMaintenanceId: withoutVehicle.maintenance.id },
      }),
    ).toBe(0);

    const otherReminder = await prisma.reminder.findFirstOrThrow({
      where: { id: withVehicle.reminder!.id },
    });
    expect(otherReminder.status).toBe('PENDING');
  });

  it('POST y PATCH sin vehículo rechazan los campos de seguimiento con VALIDATION_ERROR y no escriben', async () => {
    const before = await prisma.maintenance.count({ where: { businessId } });
    await expect(
      maintenances.create(businessId, userId, {
        maintenanceTypeId,
        performedAt: new Date().toISOString(),
        nextDueDate: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.maintenance.count({ where: { businessId } })).toBe(before);

    const created = await maintenances.create(businessId, userId, {
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
    });
    await expect(
      maintenances.update(
        businessId,
        created.maintenance.id,
        plainToInstance(UpdateMaintenanceDto, { odometerKm: 1000 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const stored = await prisma.maintenance.findFirstOrThrow({
      where: { id: created.maintenance.id },
    });
    expect(stored.odometerKm).toBeNull();
  });

  it('con vehículo, la FK sigue en RESTRICT: no se puede borrar un vehículo con mantenimientos', async () => {
    const created = await maintenances.create(businessId, userId, {
      vehicleId,
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
      odometerKm: 20000,
    });
    expect(created.maintenance.vehicleId).toBe(vehicleId);

    const error = await prisma.vehicle
      .delete({ where: { id: vehicleId } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const stored = await prisma.maintenance.findFirstOrThrow({
      where: { id: created.maintenance.id },
    });
    expect(stored.vehicleId).toBe(vehicleId);
  });
});
