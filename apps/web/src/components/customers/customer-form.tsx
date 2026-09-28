'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { present, type Customer } from '@/lib/customers/format';
import { FormError } from './form-error';
import { useSubmitLock } from '@/lib/use-submit-lock';

type Values = { name: string; phone: string; notes: string };
const FIELDS = ['name', 'phone', 'notes'] as const;

/**
 * Alta y edición de cliente. Ningún campo es obligatorio (BR-C3). Al editar
 * solo se envían los campos que cambiaron; dejar uno vacío lo borra (la API
 * no acepta null en estos campos, así que se envía texto vacío).
 */
export function CustomerForm({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    notes: customer?.notes ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!lock.acquire()) return;
    setSubmitting(true);
    setFailure(null);

    let result;
    if (customer) {
      const body: Schemas['UpdateCustomerDto'] = {};
      for (const field of FIELDS) {
        const next = values[field].trim();
        if (next !== (customer[field] ?? '').trim()) body[field] = next;
      }
      if (Object.keys(body).length === 0) {
        router.push(`/clientes/${customer.id}`);
        return;
      }
      result = await callApi(
        api.PATCH('/customers/{id}', { params: { path: { id: customer.id } }, body }),
      );
    } else {
      const body: Schemas['CreateCustomerDto'] = {};
      for (const field of FIELDS) {
        const value = present(values[field]);
        if (value) body[field] = value;
      }
      result = await callApi(api.POST('/customers', { body }));
    }

    if (result.ok) {
      router.push(`/clientes/${result.data.id}`);
      return;
    }
    setFailure(result.failure);
    lock.release();
    setSubmitting(false);
  }

  const fieldError = (field: keyof Values) => failure?.fieldErrors[field];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {failure && (
        <FormError>{failureMessage(failure, { notFound: 'Este cliente ya no existe.' })}</FormError>
      )}

      <Field id="name" label="Nombre" optional error={fieldError('name')}>
        <Input
          id="name"
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          maxLength={200}
          autoComplete="off"
          aria-invalid={!!fieldError('name') || undefined}
        />
      </Field>

      <Field
        id="phone"
        label="Teléfono"
        optional
        hint="Se usa para avisar por WhatsApp."
        error={fieldError('phone')}
      >
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => update('phone', e.target.value)}
          maxLength={50}
          autoComplete="off"
          aria-invalid={!!fieldError('phone') || undefined}
        />
      </Field>

      <Field id="notes" label="Notas" optional error={fieldError('notes')}>
        <Textarea
          id="notes"
          value={values.notes}
          onChange={(e) => update('notes', e.target.value)}
          maxLength={2000}
          aria-invalid={!!fieldError('notes') || undefined}
        />
      </Field>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Guardando…' : customer ? 'Guardar cambios' : 'Crear cliente'}
      </Button>
    </form>
  );
}
