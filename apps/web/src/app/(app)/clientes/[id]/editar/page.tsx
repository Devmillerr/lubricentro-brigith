'use client';

import { useParams } from 'next/navigation';
import { CustomerForm } from '@/components/customers/customer-form';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle } from '@/lib/customers/format';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`customer:${id}`, () =>
    callApi(api.GET('/customers/{id}', { params: { path: { id } } })),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Editar cliente"
        subtitle={query.status === 'success' ? customerTitle(query.data) : undefined}
        back={{ href: `/clientes/${id}`, label: 'Volver al cliente' }}
      />
      {query.status === 'loading' && <LoadingState />}
      {query.status === 'error' && (
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{ title: 'Cliente no encontrado', href: '/clientes', label: 'Ver clientes' }}
        />
      )}
      {query.status === 'success' && <CustomerForm customer={query.data} />}
    </div>
  );
}
