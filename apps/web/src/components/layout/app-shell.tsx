'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandLockup } from '@/components/brand/brand-mark';
import type { Me } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { LogoutButton } from './logout-button';
import { activeNavItem, NAV_ITEMS, type NavItem } from './nav-items';

/**
 * Carcasa de las pantallas con sesión. Mobile-first (07-UI-UX.md, D-01):
 * barra inferior en el teléfono; en pantallas anchas, la misma navegación en
 * una barra lateral. El rojo Brigith marca la identidad (franja superior,
 * pestaña activa); las acciones van en carbón.
 */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname();
  const current = activeNavItem(pathname);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      {/*
       * Márgenes seguros (iPhone con muesca, sobre todo en horizontal): la barra
       * lateral toma el izquierdo y el contenido el derecho. Con env() = 0 todo
       * queda igual que sin ellos. `--gutter-l/r` lo reutiliza StickyActionBar.
       */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:flex">
        <div className="h-1 shrink-0 bg-[var(--brand)]" aria-hidden />
        <div className="border-b border-[var(--border)] px-4 py-4">
          <BrandLockup subtitle={businessSubtitle(me.business.name)} emblemSize={52} />
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.label} item={item} active={item === current} />
          ))}
        </nav>
        <div className="flex flex-col gap-3 border-t border-[var(--border)] p-4">
          <UserSummary me={me} />
          <LogoutButton className="w-full" />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between gap-3 border-t-4 border-b border-t-[var(--brand)] border-b-[var(--border)] bg-[var(--surface)] pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:h-[calc(3.5rem+env(safe-area-inset-top))] md:border-t-0 md:pr-[max(2rem,env(safe-area-inset-right))] md:pl-8">
          <BrandLockup
            subtitle={businessSubtitle(me.business.name)}
            emblemSize={44}
            className="md:hidden"
          />
          {/* Sección activa (escritorio). No es un encabezado: el título de cada pantalla es su h1. */}
          <p className="hidden font-display text-xl font-bold md:block">
            {current?.label ?? 'BRIGITH'}
          </p>
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-5 pr-[var(--gutter-r)] pb-[max(7rem,calc(5rem+env(safe-area-inset-bottom)))] pl-[var(--gutter-l)] [--gutter-l:max(1rem,env(safe-area-inset-left))] [--gutter-r:max(1rem,env(safe-area-inset-right))] md:pt-8 md:pb-[max(2.5rem,env(safe-area-inset-bottom))] md:[--gutter-l:2rem] md:[--gutter-r:max(2rem,env(safe-area-inset-right))]">
          {children}
        </main>

        <nav
          aria-label="Principal"
          data-bottom-nav
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--surface)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-[0_-4px_16px_rgb(0_0_0/0.05)] md:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <BottomTab key={item.label} item={item} active={item === current} />
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

/**
 * Nombre del negocio bajo la marca, salvo que repita "Brigith" (el negocio
 * real se llama así y la cabecera mostraba "Brigith / Brigith").
 */
function businessSubtitle(name: string): string | undefined {
  return name.trim().toLocaleLowerCase('es') === 'brigith' ? undefined : name;
}
