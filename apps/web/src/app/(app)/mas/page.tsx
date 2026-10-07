import {
  ChevronRight,
  ChartColumn,
  KeyRound,
  PackagePlus,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Badge, PageHeader } from '@/components/ui/page-header';

const SECTIONS: { label: string; description: string; icon: LucideIcon; href: string | null }[] = [
  {
    label: 'Clientes',
    description: 'Clientes y sus vehículos',
    icon: Users,
    href: '/clientes',
  },
  {
    label: 'Ventas',
    description: 'Historial de cobros y lavados; detalle y anulación',
    icon: Receipt,
    href: '/ventas',
  },
  {
    label: 'Recepciones y compras',
    description: 'Mercadería recibida, cuánto pagaste y el total invertido del mes',
    icon: PackagePlus,
    href: '/inventario/recepciones',
  },
  {
    label: 'Configuración',
    description: 'Plantilla de WhatsApp, anticipación y políticas',
    icon: Settings,
    href: '/configuracion',
  },
  {
    label: 'Resumen del piloto',
    description: 'Indicadores de adopción, mantenimiento e inventario',
    icon: ChartColumn,
    href: '/resumen',
  },
  {
    label: 'Cambiar contraseña',
    description: 'Tu cuenta y sus datos siguen igual; te da un código de recuperación',
    icon: KeyRound,
    href: '/cuenta/contrasena',
  },
];

/** Pestaña "Más" (07-UI-UX.md §2). */
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
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{section.label}</span>
                <span className="text-sm text-[var(--muted-foreground)]">
                  {section.description}
                </span>
              </span>
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
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
                >
                  {body}
                </Link>
              ) : (
                <div
                  aria-disabled
                  className="flex min-h-16 items-center gap-3 px-4 py-3 opacity-60"
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
