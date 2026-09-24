import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { ReminderStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { RemindersService } from '../../src/reminders/reminders.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Reabrir recordatorios contra Postgres real: lo que el fake no puede probar
 * (el único parcial `reminders_open_unique` y el cierre real al anular).
 * Misma base y salvaguardas que stock-ledger.int-spec.ts.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan Postgres.',
  );
}
if (!/\/[^/?]*_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test".');
}

const prisma = new PrismaService({
  get: () => url,
} as unknown as ConfigService<Env, true>);
const maintenances = new MaintenancesService(prisma);
const reminders = new RemindersService(prisma, maintenances);

interface Tenant {
  businessId: string;
  userId: string;
  vehicleId: string;
  maintenanceTypeId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `REM ${suffix}`, slug: `rem-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'REM',
      username: `rem-${suffix}`,
      passwordHash: 'no-se-usa',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      businessId: business.id,
      createdById: user.id,
      plate: 'REM-001',
      plateNormalized: 'REM001',
    },
  });
  const type = await prisma.maintenanceType.create({
    data: { businessId: business.id, name: 'Cambio de aceite' },
  });
  return {
    businessId: business.id,
    userId: user.id,
    vehicleId: vehicle.id,
    maintenanceTypeId: type.id,
  };
}

async function createWithReminder(tenant: Tenant, performedAt: string) {
  const result = await maintenances.create(tenant.businessId, tenant.userId, {
    vehicleId: tenant.vehicleId,
    maintenanceTypeId: tenant.maintenanceTypeId,
    performedAt,
    odometerKm: 10_000,
    nextDueKm: 15_000,
    dueRule: 'KM',
  });
  if (!result.reminder) throw new Error('se esperaba un recordatorio');
  return { maintenanceId: result.maintenance.id, reminderId: result.reminder.id };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Reabrir recordatorios (Postgres real)', () => {
  it('uno cerrado por anulación no se reabre: 409 y conserva el motivo', async () => {
    const tenant = await createTenant();
    const { maintenanceId, reminderId } = await createWithReminder(tenant, '2026-01-10');
    await maintenances.void(tenant.businessId, tenant.userId, maintenanceId, {
      reason: 'Prueba reabrir',
    });

    await expect(
      reminders.updateStatus(tenant.businessId, reminderId, { status: 'PENDING' }),
    ).rejects.toMatchObject({ code: 'REMINDER_SOURCE_VOIDED', status: 409 });

    const stored = await prisma.reminder.findUniqueOrThrow({ where: { id: reminderId } });
    expect(stored.status).toBe(ReminderStatus.DISMISSED);
    expect(stored.closeReason).toBe('mantenimiento anulado');
    expect(stored.closedAt).not.toBeNull();
  });

  it('uno cumplido por un mantenimiento posterior no se reabre: 409 REMINDER_DONE', async () => {
    const tenant = await createTenant();
    const first = await createWithReminder(tenant, '2026-01-10');
    await createWithReminder(tenant, '2026-03-10');

    await expect(
      reminders.updateStatus(tenant.businessId, first.reminderId, { status: 'PENDING' }),
    ).rejects.toMatchObject({ code: 'REMINDER_DONE', status: 409 });

    const stored = await prisma.reminder.findUniqueOrThrow({ where: { id: first.reminderId } });
    expect(stored.status).toBe(ReminderStatus.DONE);
  });

  it('carrera con otro abierto: el único parcial responde 409, nunca 500', async () => {
    const tenant = await createTenant();
    const first = await createWithReminder(tenant, '2026-01-10');
    await reminders.updateStatus(tenant.businessId, first.reminderId, { status: 'DISMISSED' });
    // Otro recordatorio abierto del mismo vehículo y tipo, insertado directo
    // (como si hubiera llegado entre la verificación y la escritura).
    await prisma.reminder.create({
      data: {
        businessId: tenant.businessId,
        vehicleId: tenant.vehicleId,
        maintenanceTypeId: tenant.maintenanceTypeId,
        sourceMaintenanceId: first.maintenanceId,
        dueKm: 20_000,
        dueRule: 'KM',
        status: ReminderStatus.PENDING,
      },
    });

    // Sin la verificación previa, la escritura choca con reminders_open_unique.
    const skipCheck = jest
      .spyOn(reminders as unknown as { findReopenBlock: () => Promise<null> }, 'findReopenBlock')
      .mockResolvedValue(null);
    try {
      await expect(
        reminders.updateStatus(tenant.businessId, first.reminderId, { status: 'PENDING' }),
      ).rejects.toMatchObject({ code: 'REMINDER_OPEN_EXISTS', status: 409 });
    } finally {
      skipCheck.mockRestore();
    }

    // Con la verificación, el mismo caso también es 409.
    await expect(
      reminders.updateStatus(tenant.businessId, first.reminderId, { status: 'PENDING' }),
    ).rejects.toMatchObject({ code: 'REMINDER_OPEN_EXISTS', status: 409 });

    const stored = await prisma.reminder.findUniqueOrThrow({ where: { id: first.reminderId } });
    expect(stored.status).toBe(ReminderStatus.DISMISSED);
    expect(stored.closeReason).toBe('descartado');
  });

  it('uno descartado por el usuario, sin otro abierto, sí se reabre', async () => {
    const tenant = await createTenant();
    const { reminderId } = await createWithReminder(tenant, '2026-01-10');
    await reminders.updateStatus(tenant.businessId, reminderId, { status: 'DISMISSED' });

    const reopened = await reminders.updateStatus(tenant.businessId, reminderId, {
      status: 'PENDING',
    });

    expect(reopened.status).toBe(ReminderStatus.PENDING);
    expect(reopened.closeReason).toBeNull();
  });
});
