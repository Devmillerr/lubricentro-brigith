import { FixedWindowStore } from '../src/rate-limit/fixed-window.store';

const WINDOW = 60_000;

describe('FixedWindowStore (DEC-86)', () => {
  it('permite hasta el límite y rechaza el siguiente sin sumarlo', () => {
    const store = new FixedWindowStore();
    const t0 = 1_000_000;
    for (let i = 1; i <= 3; i += 1) {
      expect(store.hit('k', 3, WINDOW, t0)).toMatchObject({ allowed: true, count: i });
    }
    expect(store.hit('k', 3, WINDOW, t0)).toMatchObject({ allowed: false, count: 3 });
    expect(store.hit('k', 3, WINDOW, t0)).toMatchObject({ allowed: false, count: 3 });
  });

  it('la ventana es fija: empieza con la primera petición y se reinicia entera al vencer', () => {
    const store = new FixedWindowStore();
    const t0 = 1_000_000;
    store.hit('k', 2, WINDOW, t0);
    store.hit('k', 2, WINDOW, t0 + 59_000);
    expect(store.hit('k', 2, WINDOW, t0 + 59_999).allowed).toBe(false);

    expect(store.hit('k', 2, WINDOW, t0 + WINDOW)).toMatchObject({ allowed: true, count: 1 });
    expect(store.hit('k', 2, WINDOW, t0 + WINDOW + 1)).toMatchObject({ allowed: true, count: 2 });
    expect(store.hit('k', 2, WINDOW, t0 + WINDOW + 2).allowed).toBe(false);
  });

  it('Retry-After son los segundos que faltan para el reinicio, redondeados hacia arriba y al menos 1', () => {
    const store = new FixedWindowStore();
    const t0 = 1_000_000;
    store.hit('k', 1, WINDOW, t0);
    expect(store.hit('k', 1, WINDOW, t0).retryAfterSeconds).toBe(60);
    expect(store.hit('k', 1, WINDOW, t0 + 30_500).retryAfterSeconds).toBe(30);
    expect(store.hit('k', 1, WINDOW, t0 + 59_999).retryAfterSeconds).toBe(1);
  });

  it('cada clave tiene su propia cuota', () => {
    const store = new FixedWindowStore();
    const t0 = 1_000_000;
    expect(store.hit('a', 1, WINDOW, t0).allowed).toBe(true);
    expect(store.hit('a', 1, WINDOW, t0).allowed).toBe(false);
    expect(store.hit('b', 1, WINDOW, t0).allowed).toBe(true);
  });

  it('limpia las ventanas vencidas sin temporizadores', () => {
    const store = new FixedWindowStore();
    const t0 = 1_000_000;
    store.hit('a', 5, WINDOW, t0);
    store.hit('b', 5, WINDOW, t0);
    expect(store.size).toBe(2);

    store.hit('c', 5, WINDOW, t0 + WINDOW + 1);
    expect(store.size).toBe(1);
  });
});
