import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * El StockLedger es el único escritor de movimientos de inventario y del
 * saldo en caché (R1). Si otro archivo de `src/` crea movimientos o escribe
 * `stockQuantity`/`isCounted`, la caché puede dejar de coincidir con la suma
 * de movimientos sin que ningún test de servicio lo note.
 */
// Jest corre como ESM (sin `__dirname`) con `rootDir` = apps/api.
const SRC = join(process.cwd(), 'src');
const LEDGER = ['inventory', 'stock-ledger.ts'].join(sep);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('StockLedger como único escritor', () => {
  const files = sourceFiles(SRC).filter((path) => relative(SRC, path) !== LEDGER);

  it('ningún otro archivo de src/ crea, edita ni borra movimientos de inventario', () => {
    const offenders = files.filter((path) =>
      /inventoryMovement\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(
        readFileSync(path, 'utf8'),
      ),
    );
    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });

  it('ningún otro archivo de src/ que escribe productos toca el saldo en caché', () => {
    const offenders = files.filter((path) => {
      const source = readFileSync(path, 'utf8');
      return (
        /\bproduct\.(create|createMany|update|updateMany|upsert)\b/.test(source) &&
        /\b(stockQuantity|isCounted)\b/.test(source)
      );
    });
    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });
});
