'use client';

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
      {business.status === 'success' && <SettingsForm business={business.data} />}
    </div>
  );
}
