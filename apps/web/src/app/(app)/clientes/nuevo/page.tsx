'use client';

import { CustomerForm } from '@/components/customers/customer-form';
import { PageHeader } from '@/components/ui/page-header';

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Nuevo cliente" back={{ href: '/clientes', label: 'Clientes' }} />
      <CustomerForm />
    </div>
  );
}
