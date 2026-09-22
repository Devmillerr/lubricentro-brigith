import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { failureMessage, type ApiFailure } from '@/lib/api/request';

/**
 * Error al cargar una pantalla de detalle. 404 (no existe o es de otro
 * negocio) y 400 (id mal formado en la URL) se muestran como "no existe", con
 * vuelta al listado; el resto, con reintento.
 */
export function QueryError({
  failure,
  onRetry,
  notFound,
}: {
  failure: ApiFailure;
  onRetry: () => void;
  notFound: { title: string; href: string; label: string };
}) {
  if (failure.status === 404 || failure.status === 400) {
    return (
      <EmptyState
        title={notFound.title}
        description="Puede que el enlace esté mal o que el registro ya no exista."
        action={
          <Link href={notFound.href} className={buttonVariants({ variant: 'outline' })}>
            {notFound.label}
          </Link>
        }
      />
    );
  }
  return <ErrorState message={failureMessage(failure)} onRetry={onRetry} />;
}
