import { resolveDueRule } from '../src/maintenances/due-rules';

describe('resolveDueRule', () => {
  it('sin km ni fecha: ninguna regla, válido (BR-M6)', () => {
    expect(resolveDueRule({})).toEqual({ ok: true, dueRule: null });
  });

  it('solo km: infiere KM (BR-M4)', () => {
    expect(resolveDueRule({ nextDueKm: 5000 })).toEqual({ ok: true, dueRule: 'KM' });
  });

  it('solo fecha: infiere DATE (BR-M4)', () => {
    expect(resolveDueRule({ nextDueDate: new Date('2026-01-01') })).toEqual({
      ok: true,
      dueRule: 'DATE',
    });
  });

  it('solo km con dueRule=KM explícito: coherente', () => {
    expect(resolveDueRule({ nextDueKm: 5000, dueRule: 'KM' })).toEqual({
      ok: true,
      dueRule: 'KM',
    });
  });

  it('solo km con dueRule=DATE: incoherente', () => {
    expect(resolveDueRule({ nextDueKm: 5000, dueRule: 'DATE' })).toEqual({
      ok: false,
      reason: 'INCOHERENT_DUE_RULE',
    });
  });

  it('solo fecha con dueRule=ANY: incoherente', () => {
    expect(resolveDueRule({ nextDueDate: new Date(), dueRule: 'ANY' })).toEqual({
      ok: false,
      reason: 'INCOHERENT_DUE_RULE',
    });
  });

  it('ambos con dueRule=ANY: coherente (BR-M5)', () => {
    expect(resolveDueRule({ nextDueKm: 5000, nextDueDate: new Date(), dueRule: 'ANY' })).toEqual({
      ok: true,
      dueRule: 'ANY',
    });
  });

  it('ambos con dueRule=ALL: coherente (BR-M5)', () => {
    expect(resolveDueRule({ nextDueKm: 5000, nextDueDate: new Date(), dueRule: 'ALL' })).toEqual({
      ok: true,
      dueRule: 'ALL',
    });
  });

  it('ambos con dueRule=KM: incoherente (BR-M5 exige ANY/ALL)', () => {
    expect(resolveDueRule({ nextDueKm: 5000, nextDueDate: new Date(), dueRule: 'KM' })).toEqual({
      ok: false,
      reason: 'INCOHERENT_DUE_RULE',
    });
  });

  it('ambos sin dueRule y sin default del negocio: ambiguo (06-API.md, 400)', () => {
    expect(resolveDueRule({ nextDueKm: 5000, nextDueDate: new Date() })).toEqual({
      ok: false,
      reason: 'AMBIGUOUS_DUE_RULE',
    });
  });

  it('ambos sin dueRule pero con default del negocio: usa el default (DEC-01)', () => {
    expect(
      resolveDueRule({
        nextDueKm: 5000,
        nextDueDate: new Date(),
        businessDefaultDueRuleWhenBoth: 'ANY',
      }),
    ).toEqual({ ok: true, dueRule: 'ANY' });
  });
});
