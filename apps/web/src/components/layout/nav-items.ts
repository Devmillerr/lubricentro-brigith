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
 * "Más" agrupa Clientes (ya disponible), Configuración y Resumen del piloto.
 * Las pestañas sin pantalla se muestran deshabilitadas en vez de llevar a una
 * ruta inexistente.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', icon: House },
  { label: 'Avisar', href: null, icon: Bell },
  { label: 'Productos', href: '/productos', icon: Package },
  { label: 'Más', href: '/mas', icon: Ellipsis, sections: ['/clientes', '/vehiculos'] },
];

function matches(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === null) return false;
  return [item.href, ...(item.sections ?? [])].some((base) => matches(base, pathname));
}
