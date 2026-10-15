import { describe, expect, it } from 'vitest';
import { looksLikePlate, normalizePlate } from './plate';

const offersPlate = (text: string) => looksLikePlate(normalizePlate(text.trim()));

describe('normalizePlate', () => {
  it('quita espacios y guiones y pasa a mayúsculas', () => {
    expect(normalizePlate('abc-123')).toBe('ABC123');
    expect(normalizePlate(' qa 92 ')).toBe('QA92');
  });
});

describe('looksLikePlate', () => {
  it('no toma un teléfono como placa, completo o parcial', () => {
    expect(offersPlate('900111222')).toBe(false);
    expect(offersPlate('900 111 222')).toBe(false);
    expect(offersPlate('11122')).toBe(false);
    expect(offersPlate('9001')).toBe(false);
  });

  it('acepta placas completas, también con guion o espacios', () => {
    expect(offersPlate('ABC-123')).toBe(true);
    expect(offersPlate('abc 123')).toBe(true);
    expect(offersPlate('QA9270')).toBe(true);
    expect(offersPlate('1234-AB')).toBe(true);
  });

  it('acepta placas parciales de 4 caracteres o más', () => {
    expect(offersPlate('qa 92')).toBe(true);
    expect(offersPlate('AB12')).toBe(true);
  });

  it('acepta placas nuevas válidas', () => {
    expect(offersPlate('ZX9911')).toBe(true);
    expect(offersPlate('RQ-5512')).toBe(true);
  });

  it('no toma un nombre, un texto corto o vacío como placa', () => {
    expect(offersPlate('Rosa Quispe')).toBe(false);
    expect(offersPlate('quisp')).toBe(false);
    expect(offersPlate('A1')).toBe(false);
    expect(offersPlate('')).toBe(false);
    expect(offersPlate('   ')).toBe(false);
  });
});
