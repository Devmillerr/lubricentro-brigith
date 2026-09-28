'use client';

import { LoaderCircle, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { logout, type Me } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { isActive, NAV_ITEMS, type NavItem } from './nav-items';

/**
 * Carcasa de las pantallas con sesión. Mobile-first (07-UI-UX.md, D-01):
 * barra inferior en el teléfono; en pantallas anchas, la misma navegación en
 * una barra lateral.
 */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActive(item, pathname));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-[var(--border)] md:flex">
        <div className="flex flex-col gap-0.5 border-b border-[var(--border)] px-5 py-5">
          <span className="text-lg font-semibold">Brigith OS</span>
          <span className="truncate text-sm text-[var(--muted-foreground)]">
            {me.business.name}
          </span>
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
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 md:px-8">
          <div className="flex min-w-0 flex-col md:hidden">
            <span className="text-sm leading-tight font-semibold">Brigith OS</span>
            <span className="truncate text-xs text-[var(--muted-foreground)]">
              {me.business.name}
            </span>
          </div>
          <h1 className="hidden text-lg font-semibold md:block">
            {current?.label ?? 'Brigith OS'}
          </h1>
          <div className="flex items-center gap-3 md:hidden">
            <span className="max-w-[9rem] truncate text-sm text-[var(--muted-foreground)]">
              {me.user.name}
            </span>
            <LogoutButton compact />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-6 pb-24 md:px-8 md:pb-10">
          {children}
        </main>

        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--background)] pb-[env(safe-area-inset-bottom)] md:hidden"
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
        active ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'hover:bg-[var(--muted)]',
      )}
    >
      {content}
    </Link>
  );
}

function BottomTab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const base = 'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium';

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
      className={cn(base, active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]')}
    >
      {/* Píldora detrás del ícono: la pestaña activa se ve sin depender solo del grosor. */}
      <span
        className={cn(
          'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
          active && 'bg-[var(--muted)]',
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
      <span className="truncate text-sm font-medium">{me.user.name}</span>
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
      variant="outline"
      onClick={handleLogout}
      disabled={pending}
      aria-label="Cerrar sesión"
      className={cn(compact && 'h-10 w-10 px-0', className)}
    >
      <Icon className={cn('size-4', pending && 'animate-spin', !compact && 'mr-2')} aria-hidden />
      {!compact && (pending ? 'Cerrando sesión…' : 'Cerrar sesión')}
    </Button>
  );
}
