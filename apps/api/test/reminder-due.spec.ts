import { checkReminderDue } from '../src/reminders/reminder-due';

const today = new Date('2026-06-15T12:00:00.000Z');

describe('checkReminderDue', () => {
  it('DATE: due cuando hoy >= próxima fecha, sin anticipación (BR-R3, BR-R5)', () => {
    expect(
      checkReminderDue({
        dueRule: 'DATE',
        dueDate: new Date('2026-06-15'),
        dueKm: null,
        lastKnownKm: null,
        today,
        reminderLeadDays: null,
      }).due,
    ).toBe(true);
  });

  it('DATE: no due si la fecha todavía no llega', () => {
    expect(
      checkReminderDue({
        dueRule: 'DATE',
        dueDate: new Date('2026-07-01'),
        dueKm: null,
        lastKnownKm: null,
        today,
        reminderLeadDays: null,
      }).due,
    ).toBe(false);
  });

  it('DATE: los días de anticipación adelantan el aviso (BR-R5)', () => {
    expect(
      checkReminderDue({
        dueRule: 'DATE',
        dueDate: new Date('2026-06-20'),
        dueKm: null,
        lastKnownKm: null,
        today,
        reminderLeadDays: 7,
      }).due,
    ).toBe(true);
  });

  it('KM: due cuando el último km conocido alcanza o supera el próximo km (BR-R4)', () => {
    expect(
      checkReminderDue({
        dueRule: 'KM',
        dueDate: null,
        dueKm: 20000,
        lastKnownKm: 20500,
        today,
        reminderLeadDays: null,
      }).due,
    ).toBe(true);
  });

  it('KM: nunca se activa por sí solo sin un dato de km nuevo (BR-R4)', () => {
    expect(
      checkReminderDue({
        dueRule: 'KM',
        dueDate: null,
        dueKm: 20000,
        lastKnownKm: null,
        today,
        reminderLeadDays: null,
      }).due,
    ).toBe(false);
  });

  it('KM: no due si el último km conocido no alcanza', () => {
    expect(
      checkReminderDue({
        dueRule: 'KM',
        dueDate: null,
        dueKm: 20000,
        lastKnownKm: 19000,
        today,
        reminderLeadDays: null,
      }).due,
    ).toBe(false);
  });

  it('ANY: due si se cumple cualquiera de las dos (BR-R6)', () => {
    expect(
      checkReminderDue({
        dueRule: 'ANY',
        dueDate: new Date('2026-07-01'),
        dueKm: 20000,
        lastKnownKm: 20500,
        today,
        reminderLeadDays: null,
      }).due,
    ).toBe(true);
  });

  it('ALL: due solo si se cumplen ambas (BR-R6)', () => {
    const base = {
      dueRule: 'ALL' as const,
      dueDate: new Date('2026-07-01'),
      dueKm: 20000,
      today,
      reminderLeadDays: null,
    };
    expect(checkReminderDue({ ...base, lastKnownKm: 20500 }).due).toBe(false);
    expect(
      checkReminderDue({ ...base, dueDate: new Date('2026-06-01'), lastKnownKm: 20500 }).due,
    ).toBe(true);
  });
});
