'use client';

import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { VoidMaintenance } from '@/components/maintenance/void-maintenance';
import { buttonVariants } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import { formatQuantity } from '@/lib/inventory/format';
import { DUE_RULE_LABELS, formatDate, formatDateTime, formatKm } from '@/lib/maintenance/format';

/** Detalle de un mantenimiento (`GET /maintenances/{id}`), con corrección y anulación. */
export default function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`maintenance:${id}`, () =>
    callApi(api.GET('/maintenances/{id}', { params: { path: { id } } })),
  );
  const types = useApiQuery('maintenance-types', () => callApi(api.GET('/maintenance-types')));
  const vehicleId = query.status === 'success' ? query.data.vehicleId : null;
  const vehicle = useApiQuery(vehicleId ? `vehicle:${vehicleId}` : null, () =>
    callApi(api.GET('/vehicles/{id}', { params: { path: { id: vehicleId! } } })),
  );

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Mantenimiento" back={{ href: '/clientes', label: 'Clientes' }} />
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{
            title: 'Mantenimiento no encontrado',
            href: '/clientes',
            label: 'Ver clientes',
          }}
        />
      </div>
    );
  }

  const data = query.data;
  const voided = data.status === 'VOIDED';
  const typeName =
    types.status === 'success'
      ? (types.data.find((type) => type.id === data.maintenanceTypeId)?.name ?? 'Mantenimiento')
      : 'Mantenimiento';
  const plate = vehicle.status === 'success' ? vehicle.data.plate : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={typeName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {[plate, formatDateTime(data.performedAt)].filter(Boolean).join(' · ')}
            {voided && <Badge>Anulado</Badge>}
          </span>
        }
        back={{ href: `/vehiculos/${data.vehicleId}`, label: plate ?? 'Vehículo' }}
        action={
          !voided && (
            <Link
              href={`/mantenimientos/${data.id}/editar`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Pencil className="mr-1 size-4" aria-hidden />
              Corregir
            </Link>
          )
        }
      />

      {voided && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 text-sm">
          <p className="font-medium">
            Anulado{data.voidedAt ? ` el ${formatDate(data.voidedAt)}` : ''}
          </p>
          {present(data.voidReason) && <p>Motivo: {data.voidReason}</p>}
          <p className="text-[var(--muted-foreground)]">
            Sus productos volvieron al stock y su recordatorio se descartó.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[var(--border)] p-4 text-sm">
        <Detail label="Km">{formatKm(data.odometerKm)}</Detail>
        <Detail label="Próximo km">{formatKm(data.nextDueKm)}</Detail>
        <Detail label="Próxima fecha">{formatDate(data.nextDueDate)}</Detail>
        <Detail label="Aviso">{data.dueRule ? DUE_RULE_LABELS[data.dueRule] : null}</Detail>
      </dl>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Productos usados</h3>
        {data.items.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Sin productos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {data.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col">
                  <Link
                    href={`/productos/${item.productId}`}
                    className="truncate font-medium underline-offset-4 hover:underline"
                  >
                    {item.productNameSnapshot}
                  </Link>
                  {present(item.productCodeSnapshot) && (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {item.productCodeSnapshot}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-medium">{formatQuantity(item.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {present(data.notes) && (
        <section className="flex flex-col gap-1 text-sm">
          <h3 className="text-lg font-semibold">Notas</h3>
          <p className="whitespace-pre-line">{data.notes}</p>
        </section>
      )}

      {!voided && <VoidMaintenance maintenanceId={data.id} onVoided={query.reload} />}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className={children ? '' : 'text-[var(--muted-foreground)]'}>{children ?? '—'}</dd>
    </div>
  );
}
