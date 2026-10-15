import { formatQuantity } from '@/lib/inventory/format';
import { isGallonUnit, isLiterUnit } from '@/lib/products/units';

/**
 * Contenido de un producto que se vende de un envase abierto (DEC-93), p. ej.
 * un balde de 20 litros. Se deriva del saldo, sin guardarse aparte:
 *
 * - Saldo ≤ 0: agotado (ningún envase).
 * - Si no, los envases cerrados son los que caben llenos además del abierto:
 *   `ceil(saldo / capacidad) − 1`, y el abierto tiene lo que queda. 40 L con
 *   capacidad 20 = 1 cerrado + el abierto lleno (20 L); 35 L = 1 cerrado + 15 L.
 *
 * Con milésimas enteras, igual que el Decimal(12,3) de la base, para no
 * arrastrar el error del float.
 */
export interface ContainerState {
  capacity: number;
  /** Contenido del envase abierto (0 si está agotado). */
  open: number;
  /** Envases llenos además del abierto. */
  sealed: number;
  /** Nivel del abierto entre 0 y 1. */
  fraction: number;
  empty: boolean;
}

export function containerState(balance: number, capacity: number): ContainerState {
  const total = Math.round(balance * 1000);
  const size = Math.round(capacity * 1000);
  if (size <= 0 || total <= 0) {
    return { capacity, open: 0, sealed: 0, fraction: 0, empty: true };
  }
  const sealed = Math.ceil(total / size) - 1;
  const open = (total - sealed * size) / 1000;
  return { capacity, open, sealed, fraction: Math.min(open / capacity, 1), empty: false };
}

/** "L" para litros, "gal" para galones, "und" para unidades; las demás, tal cual. */
export function shortUnit(unit: string): string {
  if (isLiterUnit(unit)) return 'L';
  if (isGallonUnit(unit)) return 'gal';
  if (/^unidad(es)?$/i.test(unit.trim())) return 'und';
  return unit;
}

/** Cantidad con su unidad corta, como se lee en el estante: "15 L", "3 und". */
export function formatStock(quantity: number | string, unit: string): string {
  return `${formatQuantity(quantity)} ${shortUnit(unit)}`;
}

/** Equivalente en galones de una cantidad en litros (1 galón = 4 litros); null si no es litro. */
export function gallonsFor(quantity: number, unit: string): number | null {
  return isLiterUnit(unit) ? Math.round((quantity / 4) * 1000) / 1000 : null;
}
