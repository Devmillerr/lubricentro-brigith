import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/**
 * 404 de toda la app (rutas que no existen). En español, como el resto
 * (07-UI-UX.md §6). `/` decide si va al Inicio o al login según la sesión.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <SearchX className="size-10 text-[var(--muted-foreground)]" aria-hidden />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[var(--muted-foreground)]">Error 404</p>
        <h1 className="text-2xl font-semibold">Esta página no existe</h1>
        <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
          Puede que el enlace esté mal o que la página se haya movido.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ size: 'lg', className: 'w-full max-w-xs' })}>
        Ir al inicio
      </Link>
    </main>
  );
}
