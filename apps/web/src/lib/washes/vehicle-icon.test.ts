import { BusFront, Car, CarFront, CarTaxiFront, Motorbike, Truck, Van } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { vehicleIconFor } from '@/lib/washes/vehicle-icon';

describe('vehicleIconFor: ícono por nombre del tipo de lavado', () => {
  it('reconoce los tipos que hoy tiene el negocio', () => {
    expect(vehicleIconFor('Moto lineal')).toBe(Motorbike);
    expect(vehicleIconFor('Moto carguera')).toBe(Motorbike);
    expect(vehicleIconFor('Mototaxi')).toBe(CarTaxiFront);
    expect(vehicleIconFor('Tico')).toBe(CarFront);
    expect(vehicleIconFor('Auto')).toBe(Car);
    expect(vehicleIconFor('Camioneta')).toBe(Truck);
    expect(vehicleIconFor('Furgón')).toBe(Van);
    expect(vehicleIconFor('Minibán')).toBe(Van);
    expect(vehicleIconFor('Combi')).toBe(BusFront);
  });

  it('un nombre desconocido usa el auto genérico', () => {
    expect(vehicleIconFor('Tractor agrícola')).toBe(Car);
  });
});
