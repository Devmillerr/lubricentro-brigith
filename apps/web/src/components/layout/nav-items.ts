import { Bell, Ellipsis, House, Package, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** null: pestaña documentada (07-UI-UX.md §2) cuya pantalla todavía no existe. */
  href: string | null;
}

/**
 * Navegación del MVP (07-UI-UX.md §2): Inicio, Avisar, Productos y Más. Solo
 * Inicio tiene pantalla por ahora; las demás se muestran deshabilitadas en
 * vez de llevar a una ruta inexistente.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', icon: House },
  { label: 'Avisar', href: null, icon: Bell },
  { label: 'Productos', href: null, icon: Package },
  { label: 'Más', href: null, icon: Ellipsis },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return item.href !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
}
