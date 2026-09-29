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
 * "Más" agrupa Clientes, Ventas (historial), Configuración, Resumen del piloto y la
 * cuenta (cambiar contraseña).
 * Las pestañas sin pantalla se muestran deshabilitadas en vez de llevar a una
 * ruta inexistente.
 */
export const NAV_ITEMS: NavItem[] = [
  // Lavado (R5) se abre desde Inicio: es un cobro rápido del día a día.
  { label: 'Inicio', href: '/dashboard', icon: House, sections: ['/lavado'] },
  { label: 'Avisar', href: '/avisar', icon: Bell },
  { label: 'Productos', href: '/productos', icon: Package, sections: ['/inventario'] },
  {
    label: 'Más',
    href: '/mas',
    icon: Ellipsis,
    sections: [
      '/clientes',
      '/vehiculos',
      '/mantenimientos',
      '/ventas',
      '/resumen',
      '/configuracion',
      '/cuenta',
    ],
  },
];

function matches(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === null) return false;
  return [item.href, ...(item.sections ?? [])].some((base) => matches(base, pathname));
}
