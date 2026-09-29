'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { RecoveryCodeNotice } from '@/components/auth/recovery-code-notice';
import { FormError } from '@/components/customers/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { writeTokens } from '@/lib/auth/token-storage';
import { useSubmitLock } from '@/lib/use-submit-lock';

const MIN_LENGTH = 8;

type Errors = Partial<Record<'currentPassword' | 'newPassword' | 'confirm', string>>;

/**
 * Cambiar la contraseña de la cuenta actual (`POST /auth/change-password`).
 * Es la misma cuenta: no cambia el usuario, el negocio ni sus datos. La API
 * cierra las demás sesiones, devuelve un par nuevo para seguir en esta y un
 * código de recuperación que se muestra una sola vez.
 */
export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const lock = useSubmitLock();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    if (!current) found.currentPassword = 'Ingresa tu contraseña actual.';
    if (next.length < MIN_LENGTH) {
      found.newPassword = `La contraseña nueva debe tener al menos ${MIN_LENGTH} caracteres.`;
    }
    if (confirm !== next) found.confirm = 'Las contraseñas no coinciden.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !lock.acquire()) return;

    setSubmitting(true);
    const result = await callApi(
      api.POST('/auth/change-password', {
        body: { currentPassword: current, newPassword: next },
      }),
    );
    lock.release();
    setSubmitting(false);

    if (!result.ok) {
      const { fieldErrors } = result.failure;
      if (fieldErrors.currentPassword || fieldErrors.newPassword) {
        setErrors({
          currentPassword: fieldErrors.currentPassword,
          newPassword: fieldErrors.newPassword,
        });
        return;
      }
      setFormError(failureMessage(result.failure));
      return;
    }

    // La API cerró las sesiones anteriores: se sigue con el par nuevo.
    writeTokens({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
    });
    setCurrent('');
    setNext('');
    setConfirm('');
    setRecoveryCode(result.data.recoveryCode);
  }

  if (recoveryCode) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Cambiar contraseña" back={{ href: '/mas', label: 'Más' }} />
        <p
          role="status"
          className="rounded-lg border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-lg font-bold"
        >
          Contraseña actualizada.
        </p>
        <RecoveryCodeNotice code={recoveryCode} />
        <p className="text-sm text-[var(--muted-foreground)]">
          Por seguridad se cerraron las demás sesiones abiertas de esta cuenta.
        </p>
        <Link href="/mas" className={buttonVariants({ size: 'lg' })}>
          Listo
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Cambiar contraseña"
        subtitle="Tu cuenta y todos sus datos siguen igual; solo cambia la contraseña."
        back={{ href: '/mas', label: 'Más' }}
      />
      {formError && <FormError>{formError}</FormError>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field id="current-password" label="Contraseña actual" error={errors.currentPassword}>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            aria-invalid={errors.currentPassword ? true : undefined}
          />
        </Field>
        <Field
          id="new-password"
          label="Contraseña nueva"
          hint={`Al menos ${MIN_LENGTH} caracteres.`}
          error={errors.newPassword}
        >
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={errors.newPassword ? true : undefined}
          />
        </Field>
        <Field id="confirm-password" label="Repite la contraseña nueva" error={errors.confirm}>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={errors.confirm ? true : undefined}
          />
        </Field>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </div>
  );
}
