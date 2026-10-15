import {
  BusFront,
  Car,
  CarFront,
  CarTaxiFront,
  Motorbike,
  Truck,
  Van,
  type LucideIcon,
} from 'lucide-react';

/**
 * Ícono del tipo de vehículo de un lavado, elegido por su nombre (los tipos son
 * datos del negocio, no una lista fija). Ayuda a reconocer la opción de un
 * vistazo; el nombre y el precio siguen visibles. Sin coincidencia: un auto.
 */
const RULES: { match: RegExp; icon: LucideIcon }[] = [
  { match: /mototaxi/, icon: CarTaxiFront },
  { match: /moto/, icon: Motorbike },
  { match: /combi|bus|coaster/, icon: BusFront },
  { match: /furg[oó]n|miniv[aá]n|minib[aá]n|van/, icon: Van },
  { match: /camioneta|pick ?up|cami[oó]n/, icon: Truck },
  { match: /tico|compacto/, icon: CarFront },
];

export function vehicleIconFor(name: string): LucideIcon {
  const key = name.toLocaleLowerCase('es');
  return RULES.find((rule) => rule.match.test(key))?.icon ?? Car;
}
