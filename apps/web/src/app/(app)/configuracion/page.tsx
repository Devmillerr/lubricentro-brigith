'use client';

import { ChevronRight, FolderTree } from 'lucide-react';
import Link from 'next/link';
import { SettingsForm } from '@/components/business/settings-form';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';

/**
 * Configuración del negocio (07-UI-UX.md §3.7): lee `GET /business` y guarda
 * con `PATCH /business/settings`.
 */
export default function SettingsPage() {
  const business = useApiQuery('business', () => callApi(api.GET('/business')));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Configuración"
        subtitle={business.status === 'success' ? business.data.name : undefined}
        back={{ href: '/mas', label: 'Más' }}
      />
      {business.status === 'loading' && <LoadingState label="Cargando configuración…" />}
      {business.status === 'error' && (
        <ErrorState
          message={failureMessage(business.failure, {
            notFound: 'No se encontró el negocio de tu sesión. Vuelve a iniciar sesión.',
          })}
          onRetry={business.reload}
        />
      )}
      <Link
        href="/configuracion/categorias"
        className="flex min-h-14 items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3 hover:bg-[var(--muted)]"
      >
        <FolderTree className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">Categorías de productos</span>
          <span className="text-sm text-[var(--muted-foreground)]">
            Crear, renombrar, mover, ordenar o desactivar
          </span>
        </span>
        <ChevronRight className="size-5 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
      {business.status === 'success' && <SettingsForm business={business.data} />}
    </div>
  );
}
