import type { Schemas } from '@/lib/api/client';

export type Customer = Schemas['CustomerResponse'];
export type Vehicle = Schemas['VehicleResponse'];
export type VehicleModel = Schemas['VehicleModelResponse'];

/** Texto vacío o solo espacios cuenta como "sin dato" (la API guarda "" al vaciar un campo). */
export function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Ningún dato del cliente es obligatorio (BR-C3): se muestra lo que haya. */
export function customerTitle(customer: Pick<Customer, 'name' | 'phone'>): string {
  return present(customer.name) ?? present(customer.phone) ?? 'Cliente sin nombre';
}

export function vehicleModelLabel(model: VehicleModel): string {
  const years =
    model.yearFrom && model.yearTo && model.yearFrom !== model.yearTo
      ? ` (${model.yearFrom}–${model.yearTo})`
      : model.yearFrom || model.yearTo
        ? ` (${model.yearFrom ?? model.yearTo})`
        : '';
  // `make` es opcional (R2): el texto del dueño puede venir completo en `model`.
  return `${[model.make, model.model].filter(Boolean).join(' ')}${years}`;
}
