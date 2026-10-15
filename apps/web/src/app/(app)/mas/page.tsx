import {
  ChevronRight,
  PackagePlus,
  Receipt,
  Settings,
  Truck,
  Wallet,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { AccountSection } from '@/components/layout/account-section';
import { Badge, PageHeader } from '@/components/ui/page-header';

const SECTIONS: { label: string; icon: LucideIcon; href: string | null }[] = [
  {
    label: 'Clientes',
    icon: Users,
    href: '/clientes',
  },
  {
    label: 'Ventas',
    icon: Receipt,
    href: '/ventas',
  },
  {
    label: 'Recepciones y compras',
    icon: PackagePlus,
    href: '/inventario/recepciones',
  },
  {
    label: 'Proveedores',
    icon: Truck,
    href: '/proveedores',
  },
  {
    label: 'Cuentas por pagar',
    icon: Wallet,
    href: '/cuentas-por-pagar',
  },
  {
    label: 'Configuración',
    icon: Settings,
    href: '/configuracion',
  },
];

/**
 * Pestaña "Más" (07-UI-UX.md §2): una fila por sección, sin descripciones (el
 * nombre y el ícono bastan), y al final la cuenta con Cerrar sesión.
 */
export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Más" />
      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const body = (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--muted)]">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 font-semibold">{section.label}</span>
              {section.href ? (
                <ChevronRight className="size-5 text-[var(--muted-foreground)]" aria-hidden />
              ) : (
                <Badge>Pronto</Badge>
              )}
            </>
          );
          return (
            <li key={section.label}>
              {section.href ? (
                <Link
                  href={section.href}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
                >
                  {body}
                </Link>
              ) : (
                <div
                  aria-disabled
                  className="flex min-h-14 items-center gap-3 px-4 py-3 opacity-60"
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <AccountSection />
    </div>
  );
}
