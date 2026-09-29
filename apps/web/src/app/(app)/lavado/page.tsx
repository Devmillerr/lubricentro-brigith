'use client';

import { Droplets, History } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { WashForm } from '@/components/washes/wash-form';
import { WashSaved } from '@/components/washes/wash-saved';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { salesHistoryHref, type Sale } from '@/lib/sales/format';
import { chargeableWashTypes } from '@/lib/washes/format';

/**
 * Lavado (07-UI-UX.md §3.9, B-146): cobro rápido sin cliente ni placa. Pide
 * `GET /wash-types` sin `includeInactive` (solo tipos y precios activos, DEC-64)
 * y además oculta los tipos sin ningún precio: no se pueden cobrar.
 */
export default function WashPage() {
  const query = useApiQuery('wash-types:active', () => callApi(api.GET('/wash-types')));
  const [saved, setSaved] = useState<Sale | null>(null);
  // Aviso de un cobro rechazado porque el tipo o el precio cambió (se recarga la lista).
  const [notice, setNotice] = useState<string | null>(null);
  // Cambia en cada lavado nuevo para empezar el formulario de cero.
  const [round, setRound] = useState(0);

  const history = (
    <Link
      href={salesHistoryHref('WASH')}
      className={buttonVariants({ variant: 'outline' })}
      aria-label="Lavados registrados"
    >
      <History className="size-4" aria-hidden />
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Nuevo lavado"
        back={{ href: '/dashboard', label: 'Inicio' }}
        action={history}
      />

      {saved ? (
        <WashSaved
          sale={saved}
          onNew={() => {
            setSaved(null);
            setNotice(null);
            setRound((value) => value + 1);
          }}
        />
      ) : (
        <>
          {notice && <FormError>{notice}</FormError>}
          {query.status === 'loading' && <LoadingState label="Cargando tipos de lavado…" />}
          {query.status === 'error' && (
            <ErrorState message={failureMessage(query.failure)} onRetry={query.reload} />
          )}
          {query.status === 'success' &&
            (() => {
              const types = chargeableWashTypes(query.data);
              if (types.length === 0) {
                return (
                  <EmptyState
                    icon={Droplets}
                    title="No hay lavados para cobrar"
                    description="Ningún tipo de lavado activo tiene precio. Agrégalo en Configuración."
                    action={
                      <Link
                        href="/configuracion/lavados"
                        className={buttonVariants({ variant: 'outline' })}
                      >
                        Tipos de lavado
                      </Link>
                    }
                  />
                );
              }
              return (
                <WashForm
                  key={round}
                  types={types}
                  onSaved={(sale) => {
                    setNotice(null);
                    setSaved(sale);
                  }}
                  onStale={(message) => {
                    setNotice(message);
                    setRound((value) => value + 1);
                    query.reload();
                  }}
                />
              );
            })()}
        </>
      )}
    </div>
  );
}
