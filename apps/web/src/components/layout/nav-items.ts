import { Bell, Ellipsis, House, Package, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** null: pestaña documentada (07-UI-UX.md §2) cuya pantalla todavía no existe. */
  href: string | null;
  /** Otras rutas que pertenecen a esta pestaña (p. ej. Clientes vive dentro de "Más"). */
  sections?: string[];
}

/**
 * Navegación del MVP (07-UI-UX.md §2): Inicio, Avisar, Productos y Más.
 *
 * Cada pestaña marca también las pantallas que se abren desde ella: los
 * cobros y el trabajo del día (Vender, Lavado, Mantenimiento, la ficha del
 * vehículo que se busca por placa) son de Inicio; Clientes, el historial de
 * Ventas, Configuración y la cuenta son de "Más". Si dos rutas coinciden, gana
 * la más específica: `/ventas/nueva` es de Inicio aunque `/ventas` sea de Más.
 * Las pestañas sin pantalla se muestran deshabilitadas en vez de llevar a una
 * ruta inexistente.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Inicio',
    href: '/dashboard',
    icon: House,
    sections: ['/lavado', '/ventas/nueva', '/mantenimientos', '/vehiculos'],
  },
  { label: 'Avisar', href: '/avisar', icon: Bell },
  // Recepciones y compras viven en Inventario, dentro de Productos.
  { label: 'Productos', href: '/productos', icon: Package, sections: ['/inventario'] },
  {
    label: 'Más',
    href: '/mas',
    icon: Ellipsis,
    sections: ['/clientes', '/ventas', '/configuracion', '/cuenta'],
  },
];

function matches(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Largo de la ruta más específica de la pestaña que coincide; -1 si ninguna. */
function matchLength(item: NavItem, pathname: string): number {
  if (item.href === null) return -1;
  return Math.max(
    -1,
    ...[item.href, ...(item.sections ?? [])]
      .filter((base) => matches(base, pathname))
      .map((base) => base.length),
  );
}

/** La pestaña de la pantalla actual: la de la ruta más específica que coincide. */
export function activeNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  let bestLength = -1;
  for (const item of NAV_ITEMS) {
    const length = matchLength(item, pathname);
    if (length > bestLength) {
      best = item;
      bestLength = length;
    }
  }
  return best;
}
