'use client';

import { Wrench } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MaintenanceEditForm } from '@/components/maintenance/maintenance-edit-form';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatDateTime } from '@/lib/maintenance/format';

/** Corregir un mantenimiento (`PATCH /maintenances/{id}`, BR-M11). */
export default function EditMaintenancePage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`maintenance:${id}`, () =>
    callApi(api.GET('/maintenances/{id}', { params: { path: { id } } })),
  );
  const back = { href: `/mantenimientos/${id}`, label: 'Volver al mantenimiento' };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Corregir mantenimiento"
        subtitle={query.status === 'success' ? formatDateTime(query.data.performedAt) : undefined}
        back={back}
      />
      {query.status === 'loading' && <LoadingState />}
      {query.status === 'error' && (
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{
            title: 'Mantenimiento no encontrado',
            href: '/clientes',
            label: 'Ver clientes',
          }}
        />
      )}
      {query.status === 'success' &&
        (query.data.status === 'VOIDED' ? (
          <EmptyState
            icon={Wrench}
            title="Este mantenimiento está anulado"
            description="Un mantenimiento anulado no se puede corregir."
            action={
              <Link href={back.href} className={buttonVariants({ variant: 'outline' })}>
                Volver
              </Link>
            }
          />
        ) : (
          <MaintenanceEditForm maintenance={query.data} />
        ))}
    </div>
  );
}
