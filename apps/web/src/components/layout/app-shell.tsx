'use client';

import { LoaderCircle, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BrandLockup } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { logout, type Me } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { isActive, NAV_ITEMS, type NavItem } from './nav-items';

/**
 * Carcasa de las pantallas con sesión. Mobile-first (07-UI-UX.md, D-01):
 * barra inferior en el teléfono; en pantallas anchas, la misma navegación en
 * una barra lateral. El rojo Brigith marca la identidad (franja superior,
 * pestaña activa); las acciones van en carbón.
 */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActive(item, pathname));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        <div className="h-1 shrink-0 bg-[var(--brand)]" aria-hidden />
        <div className="border-b border-[var(--border)] px-4 py-4">
          <BrandLockup subtitle={businessSubtitle(me.business.name)} emblemSize={52} />
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.label} item={item} active={isActive(item, pathname)} />
          ))}
        </nav>
        <div className="flex flex-col gap-3 border-t border-[var(--border)] p-4">
          <UserSummary me={me} />
          <LogoutButton className="w-full" />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-t-4 border-b border-t-[var(--brand)] border-b-[var(--border)] bg-[var(--surface)] px-4 md:h-14 md:border-t-0 md:px-8">
          <BrandLockup
            subtitle={businessSubtitle(me.business.name)}
            emblemSize={44}
            className="md:hidden"
          />
          {/* Sección activa (escritorio). No es un encabezado: el título de cada pantalla es su h1. */}
          <p className="hidden font-display text-xl font-bold md:block">
            {current?.label ?? 'Brigith'}
          </p>
          <div className="flex items-center gap-1 md:hidden">
            <span className="max-w-[8rem] truncate text-sm font-medium text-[var(--muted-foreground)]">
              {me.user.name}
            </span>
            <LogoutButton compact />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10">
          {children}
        </main>

        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.05)] md:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <BottomTab key={item.label} item={item} active={isActive(item, pathname)} />
          ))}
        </nav>
      </div>
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.href === null && <ComingSoonBadge />}
    </>
  );
  const base = 'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium';

  if (item.href === null) {
    return (
      <span aria-disabled className={cn(base, 'cursor-not-allowed text-[var(--muted-foreground)]')}>
        {content}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        base,
        active
          ? 'bg-[var(--primary)] font-semibold text-[var(--primary-foreground)] shadow-[inset_4px_0_0_var(--brand)]'
          : 'hover:bg-[var(--muted)]',
      )}
    >
      {content}
    </Link>
  );
}

function BottomTab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const base = 'relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium';

  if (item.href === null) {
    return (
      <span
        aria-disabled
        title="Próximamente"
        className={cn(base, 'text-[var(--muted-foreground)] opacity-60')}
      >
        <Icon className="size-5" aria-hidden />
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        base,
        active ? 'font-bold text-[var(--foreground)]' : 'text-[var(--muted-foreground)]',
      )}
    >
      {/*
       * Barra roja arriba + píldora detrás del ícono + etiqueta en negrita:
       * la pestaña activa se reconoce sin depender solo del color.
       */}
      {active && (
        <span
          className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[var(--brand)]"
          aria-hidden
        />
      )}
      <span
        className={cn(
          'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
          active && 'bg-[var(--brand-soft)] text-[var(--brand)]',
        )}
      >
        <Icon className={cn('size-5', active && 'stroke-[2.5]')} aria-hidden />
      </span>
      {item.label}
    </Link>
  );
}

function ComingSoonBadge() {
  return (
    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[0.625rem] font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
      Pronto
    </span>
  );
}

function UserSummary({ me }: { me: Me }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-semibold">{me.user.name}</span>
      <span className="truncate text-xs text-[var(--muted-foreground)]">@{me.user.username}</span>
    </div>
  );
}

function LogoutButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await logout();
    // El layout protegido redirige al login al quedar sin sesión.
  }

  const Icon = pending ? LoaderCircle : LogOut;
  return (
    <Button
      variant={compact ? 'ghost' : 'outline'}
      size={compact ? 'icon' : 'default'}
      onClick={handleLogout}
      disabled={pending}
      aria-label="Cerrar sesión"
      className={className}
    >
      <Icon className={cn('size-4', pending && 'animate-spin', !compact && 'mr-2')} aria-hidden />
      {!compact && (pending ? 'Cerrando sesión…' : 'Cerrar sesión')}
    </Button>
  );
}

/**
 * Nombre del negocio bajo la marca, salvo que repita "Brigith" (el negocio
 * real se llama así y la cabecera mostraba "Brigith / Brigith").
 */
function businessSubtitle(name: string): string | undefined {
  return name.trim().toLocaleLowerCase('es') === 'brigith' ? undefined : name;
}
