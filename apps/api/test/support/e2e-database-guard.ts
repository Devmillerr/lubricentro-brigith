/**
 * Las e2e montan la app completa, y Nest carga `.env` (que en una copia de
 * trabajo puede apuntar a producción) para las variables que falten. Antes de
 * cargar cualquier prueba se exige que `DATABASE_URL` venga del entorno y
 * apunte a una base local cuyo nombre termine en `_test` (R8, DEC-101). Sin
 * eso, la corrida se detiene: nunca se prueba contra otra base.
 */
const raw = process.env.DATABASE_URL;

function isLocalTestDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    const database = url.pathname.replace(/^\//, '');
    return (host === 'localhost' || host === '127.0.0.1') && /_test$/.test(database);
  } catch {
    return false;
  }
}

if (!isLocalTestDatabase(raw)) {
  throw new Error(
    'Las pruebas e2e exigen DATABASE_URL hacia una base local (localhost o 127.0.0.1) cuyo nombre termine en "_test".',
  );
}

export {};
