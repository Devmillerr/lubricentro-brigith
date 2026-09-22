import { normalizePlate } from '../src/vehicles/plate.util';

describe('normalizePlate', () => {
  it('pasa a mayúsculas', () => {
    expect(normalizePlate('abc123')).toBe('ABC123');
  });

  it('quita espacios', () => {
    expect(normalizePlate('ABC 123')).toBe('ABC123');
  });

  it('quita guiones', () => {
    expect(normalizePlate('ABC-123')).toBe('ABC123');
  });

  it('combina mayúsculas, espacios y guiones', () => {
    expect(normalizePlate('abc-123 xyz')).toBe('ABC123XYZ');
  });

  it('conserva otros caracteres tal cual (no valida formato, BR-C6)', () => {
    expect(normalizePlate('ab.12*3')).toBe('AB.12*3');
  });
});
