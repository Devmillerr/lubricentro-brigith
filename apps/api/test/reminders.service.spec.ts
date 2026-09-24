import { MaintenancesService } from '../src/maintenances/maintenances.service';
import { RemindersService } from '../src/reminders/reminders.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores, businesses } = buildFakeScopedPrisma([
    'vehicle',
    'customer',
    'maintenanceType',
    'maintenance',
    'maintenanceItem',
    'reminder',
    'reminderContact',
  ]);
  const service = new RemindersService(prisma, new MaintenancesService(prisma));

  businesses.set('biz-a', { id: 'biz-a', reminderLeadDays: null, whatsappTemplate: null });
  businesses.set('biz-b', { id: 'biz-b', reminderLeadDays: null, whatsappTemplate: null });

  const vehicles = stores.get('vehicle')!;
  const customers = stores.get('customer')!;
  vehicles.set('veh-1', {
    id: 'veh-1',
    businessId: 'biz-a',
    plate: 'ABC-123',
    customerId: 'cust-1',
  });
  customers.set('cust-1', {
    id: 'cust-1',
    businessId: 'biz-a',
    name: 'Ana',
    phone: '999-888-777',
  });
  vehicles.set('veh-2', { id: 'veh-2', businessId: 'biz-a', plate: 'XYZ-999', customerId: null });

  return {
    service,
    businesses,
    vehicles,
    customers,
    reminders: stores.get('reminder')!,
    maintenances: stores.get('maintenance')!,
    contacts: stores.get('reminderContact')!,
  };
}

function reminder(overrides: Record<string, unknown>) {
  return {
    id: 'rem-1',
    businessId: 'biz-a',
    vehicleId: 'veh-1',
    maintenanceTypeId: 'type-1',
    sourceMaintenanceId: 'mnt-1',
    dueDate: null,
    dueKm: null,
    dueRule: 'DATE',
    status: 'PENDING',
    closedByMaintenanceId: null,
    closedAt: null,
    closeReason: null,
    ...overrides,
  };
}

describe('RemindersService.list', () => {
  it('due=now (default) incluye un recordatorio con fecha ya alcanzada, motivo DATE_REACHED', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ dueDate: new Date('2020-01-01'), dueRule: 'DATE' }));

    const page = await service.list('biz-a', {});

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.reason).toBe('DATE_REACHED');
    expect(page.items[0]?.due).toBe(true);
  });

  it('due=now excluye un recordatorio cuya fecha todavía no llega', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ dueDate: new Date('2099-01-01'), dueRule: 'DATE' }));

    const page = await service.list('biz-a', { due: 'now' });

    expect(page.items).toHaveLength(0);
  });

  it('due=upcoming muestra lo que todavía no es due', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ dueDate: new Date('2099-01-01'), dueRule: 'DATE' }));

    const page = await service.list('biz-a', { due: 'upcoming' });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.due).toBe(false);
  });

  it('due=all incluye recordatorios cerrados (DONE/DISMISSED)', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ status: 'DONE', dueDate: new Date('2020-01-01') }));

    const soloNow = await service.list('biz-a', { due: 'now' });
    expect(soloNow.items).toHaveLength(0);

    const all = await service.list('biz-a', { due: 'all' });
    expect(all.items).toHaveLength(1);
  });

  it('motivo NO_PHONE cuando el vehículo no tiene cliente/teléfono, sin ocultarlo (BR-R8)', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ vehicleId: 'veh-2', dueDate: new Date('2020-01-01') }));

    const page = await service.list('biz-a', {});

    expect(page.items[0]?.reason).toBe('NO_PHONE');
    expect(page.items[0]?.hasPhone).toBe(false);
  });

  it('KM solo alcanzado por el último km conocido del vehículo (BR-R4)', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-last', {
      id: 'mnt-last',
      businessId: 'biz-a',
      vehicleId: 'veh-1',
      status: 'ACTIVE',
      performedAt: new Date('2026-01-01'),
      odometerKm: 21000,
    });
    reminders.set('rem-1', reminder({ dueRule: 'KM', dueKm: 20000 }));

    const page = await service.list('biz-a', {});

    expect(page.items[0]?.reason).toBe('KM_REACHED_BY_LAST_KNOWN');
  });

  it('no cruza negocios', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ businessId: 'biz-a', dueDate: new Date('2020-01-01') }));

    const page = await service.list('biz-b', {});

    expect(page.items).toHaveLength(0);
  });
});

describe('RemindersService.findOne', () => {
  it('incluye la vista previa del mensaje según la plantilla del negocio (BR-W3)', async () => {
    const { service, reminders, businesses } = setup();
    businesses.set('biz-a', {
      id: 'biz-a',
      reminderLeadDays: null,
      whatsappTemplate: 'Hola {cliente}, tu {placa} vence el {proxima_fecha}',
    });
    reminders.set('rem-1', reminder({ dueDate: new Date('2026-07-01') }));

    const detail = await service.findOne('biz-a', 'rem-1');

    expect(detail.previewMessage).toBe('Hola Ana, tu ABC-123 vence el 2026-07-01');
  });

  it('rechaza con REMINDER_NOT_FOUND para uno de otro negocio', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({}));

    await expect(service.findOne('biz-b', 'rem-1')).rejects.toMatchObject({
      code: 'REMINDER_NOT_FOUND',
    });
  });
});

describe('RemindersService.contact', () => {
  it('registra el contacto, pasa a CONTACTED y devuelve el enlace wa.me (BR-W6, BR-R10)', async () => {
    const { service, reminders, contacts } = setup();
    reminders.set('rem-1', reminder({}));

    const result = await service.contact('biz-a', 'user-a', 'rem-1');

    expect(result.waLink).toBe('https://wa.me/999888777');
    expect(reminders.get('rem-1')?.status).toBe('CONTACTED');
    expect([...contacts.values()]).toHaveLength(1);
    expect([...contacts.values()][0]?.userId).toBe('user-a');
  });

  it('422 NO_PHONE si el cliente no tiene teléfono', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ vehicleId: 'veh-2' }));

    await expect(service.contact('biz-a', 'user-a', 'rem-1')).rejects.toMatchObject({
      code: 'NO_PHONE',
    });
  });

  it('rechaza contactar un recordatorio ya cerrado (DONE)', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ status: 'DONE' }));

    await expect(service.contact('biz-a', 'user-a', 'rem-1')).rejects.toMatchObject({
      code: 'REMINDER_ALREADY_CLOSED',
    });
  });
});

describe('RemindersService.updateStatus', () => {
  it('DISMISSED es una acción explícita del usuario (BR-R9)', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({}));

    const updated = await service.updateStatus('biz-a', 'rem-1', { status: 'DISMISSED' });

    expect(updated.status).toBe('DISMISSED');
    expect(updated.closeReason).toBe('descartado');
  });

  it('PENDING deshace el cierre ("undo", 07-UI-UX.md §3.4)', async () => {
    const { service, reminders } = setup();
    reminders.set(
      'rem-1',
      reminder({ status: 'CONTACTED', closedAt: new Date(), closeReason: 'cumplido' }),
    );

    const updated = await service.updateStatus('biz-a', 'rem-1', { status: 'PENDING' });

    expect(updated.status).toBe('PENDING');
    expect(updated.closedAt).toBeNull();
    expect(updated.closeReason).toBeNull();
  });

  it('rechaza con REMINDER_NOT_FOUND para uno de otro negocio', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({}));

    await expect(
      service.updateStatus('biz-b', 'rem-1', { status: 'DISMISSED' }),
    ).rejects.toMatchObject({ code: 'REMINDER_NOT_FOUND' });
  });

  it('reabre uno descartado por el usuario si su mantenimiento sigue activo', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'ACTIVE' });
    reminders.set(
      'rem-1',
      reminder({ status: 'DISMISSED', closedAt: new Date(), closeReason: 'descartado' }),
    );

    const updated = await service.updateStatus('biz-a', 'rem-1', { status: 'PENDING' });

    expect(updated.status).toBe('PENDING');
    expect(updated.closeReason).toBeNull();
  });

  it('no reabre uno cuyo mantenimiento de origen fue anulado: 409 y conserva el motivo (BR-M12)', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'VOIDED' });
    const closedAt = new Date('2026-09-01');
    reminders.set(
      'rem-1',
      reminder({ status: 'DISMISSED', closedAt, closeReason: 'mantenimiento anulado' }),
    );

    await expect(
      service.updateStatus('biz-a', 'rem-1', { status: 'PENDING' }),
    ).rejects.toMatchObject({ code: 'REMINDER_SOURCE_VOIDED', status: 409 });
    expect(reminders.get('rem-1')).toMatchObject({
      status: 'DISMISSED',
      closedAt,
      closeReason: 'mantenimiento anulado',
    });
  });

  it('no reabre uno cumplido (DONE): 409 y conserva quién lo cerró', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'ACTIVE' });
    reminders.set(
      'rem-1',
      reminder({
        status: 'DONE',
        closedAt: new Date(),
        closeReason: 'cumplido',
        closedByMaintenanceId: 'mnt-2',
      }),
    );

    await expect(
      service.updateStatus('biz-a', 'rem-1', { status: 'PENDING' }),
    ).rejects.toMatchObject({ code: 'REMINDER_DONE', status: 409 });
    expect(reminders.get('rem-1')).toMatchObject({
      status: 'DONE',
      closeReason: 'cumplido',
      closedByMaintenanceId: 'mnt-2',
    });
  });

  it('409 REMINDER_OPEN_EXISTS si ya hay otro abierto para el mismo vehículo y tipo', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'ACTIVE' });
    reminders.set('rem-1', reminder({ status: 'DISMISSED', closeReason: 'descartado' }));
    reminders.set(
      'rem-2',
      reminder({ id: 'rem-2', sourceMaintenanceId: 'mnt-2', status: 'CONTACTED' }),
    );

    await expect(
      service.updateStatus('biz-a', 'rem-1', { status: 'PENDING' }),
    ).rejects.toMatchObject({ code: 'REMINDER_OPEN_EXISTS', status: 409 });
    expect(reminders.get('rem-1')?.status).toBe('DISMISSED');
  });

  it('otro abierto de otro tipo o de otro negocio no impide reabrir', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'ACTIVE' });
    reminders.set('rem-1', reminder({ status: 'DISMISSED', closeReason: 'descartado' }));
    reminders.set('rem-2', reminder({ id: 'rem-2', maintenanceTypeId: 'type-2' }));
    reminders.set('rem-3', reminder({ id: 'rem-3', businessId: 'biz-b' }));

    const updated = await service.updateStatus('biz-a', 'rem-1', { status: 'PENDING' });

    expect(updated.status).toBe('PENDING');
  });

  it('descartar uno ya cerrado se rechaza y no pisa el motivo de anulación', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ status: 'DISMISSED', closeReason: 'mantenimiento anulado' }));

    await expect(
      service.updateStatus('biz-a', 'rem-1', { status: 'DISMISSED' }),
    ).rejects.toMatchObject({ code: 'REMINDER_ALREADY_CLOSED', status: 409 });
    expect(reminders.get('rem-1')?.closeReason).toBe('mantenimiento anulado');
  });
});

describe('RemindersService.findOne: reopenBlockedBy', () => {
  it('null si está abierto', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({}));

    const detail = await service.findOne('biz-a', 'rem-1');

    expect(detail.reopenBlockedBy).toBeNull();
  });

  it('null si fue descartado por el usuario y se puede reabrir', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'ACTIVE' });
    reminders.set('rem-1', reminder({ status: 'DISMISSED', closeReason: 'descartado' }));

    const detail = await service.findOne('biz-a', 'rem-1');

    expect(detail.reopenBlockedBy).toBeNull();
    expect(detail.closeReason).toBe('descartado');
  });

  it('SOURCE_VOIDED si su mantenimiento fue anulado', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'VOIDED' });
    reminders.set('rem-1', reminder({ status: 'DISMISSED', closeReason: 'mantenimiento anulado' }));

    const detail = await service.findOne('biz-a', 'rem-1');

    expect(detail.reopenBlockedBy).toBe('SOURCE_VOIDED');
    expect(detail.closeReason).toBe('mantenimiento anulado');
  });

  it('DONE si ya se cumplió', async () => {
    const { service, reminders } = setup();
    reminders.set('rem-1', reminder({ status: 'DONE', closeReason: 'cumplido' }));

    const detail = await service.findOne('biz-a', 'rem-1');

    expect(detail.reopenBlockedBy).toBe('DONE');
  });

  it('OPEN_EXISTS si hay otro abierto para el mismo vehículo y tipo', async () => {
    const { service, reminders, maintenances } = setup();
    maintenances.set('mnt-1', { id: 'mnt-1', businessId: 'biz-a', status: 'ACTIVE' });
    reminders.set('rem-1', reminder({ status: 'DISMISSED', closeReason: 'descartado' }));
    reminders.set('rem-2', reminder({ id: 'rem-2', sourceMaintenanceId: 'mnt-2' }));

    const detail = await service.findOne('biz-a', 'rem-1');

    expect(detail.reopenBlockedBy).toBe('OPEN_EXISTS');
  });
});
