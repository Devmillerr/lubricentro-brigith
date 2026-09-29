'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { RecoveryCodeNotice } from '@/components/auth/recovery-code-notice';
import { BrandEmblem } from '@/components/brand/brand-mark';
import { FormError } from '@/components/customers/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useSubmitLock } from '@/lib/use-submit-lock';

const MIN_LENGTH = 8;

type Errors = Partial<Record<'username' | 'recoveryCode' | 'newPassword' | 'confirm', string>>;

/**
 * Recuperar la contraseña con el código de recuperación (`POST /auth/recover`).
 * Sin correo ni registro: el código se obtiene al cambiar la contraseña. El
 * código usado deja de servir y la API devuelve uno nuevo, que se muestra aquí.
 */
export default function RecoverPasswordPage() {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const lock = useSubmitLock();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    if (!username.trim()) found.username = 'Ingresa tu usuario.';
    if (!code.trim()) found.recoveryCode = 'Ingresa tu código de recuperación.';
    if (next.length < MIN_LENGTH) {
      found.newPassword = `La contraseña nueva debe tener al menos ${MIN_LENGTH} caracteres.`;
    }
    if (confirm !== next) found.confirm = 'Las contraseñas no coinciden.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !lock.acquire()) return;

    setSubmitting(true);
    const result = await callApi(
      api.POST('/auth/recover', {
        body: { username: username.trim(), recoveryCode: code.trim(), newPassword: next },
      }),
    );
    lock.release();
    setSubmitting(false);

    if (!result.ok) {
      if (result.failure.fieldErrors.newPassword) {
        setErrors({ newPassword: result.failure.fieldErrors.newPassword });
        return;
      }
      setFormError(
        failureMessage(result.failure, {
          byCode: {
            INVALID_RECOVERY_CODE: 'Usuario o código de recuperación incorrectos.',
          },
        }),
      );
      return;
    }

    setNext('');
    setConfirm('');
    setCode('');
    setNewCode(result.data.recoveryCode);
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandEmblem size={112} priority />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[1.75rem] leading-tight font-bold">Recuperar contraseña</h1>
          {!newCode && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Usa el código de recuperación que guardaste al cambiar tu contraseña.
            </p>
          )}
        </div>
      </div>

      {newCode ? (
        <div className="flex flex-col gap-4">
          <p
            role="status"
            className="rounded-lg border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-base font-bold"
          >
            Contraseña actualizada. El código que usaste ya no sirve: guarda el nuevo.
          </p>
          <RecoveryCodeNotice code={newCode} />
          <Link href="/login" className={buttonVariants({ size: 'lg' })}>
            Iniciar sesión
          </Link>
        </div>
      ) : (
        <>
          {formError && <FormError>{formError}</FormError>}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field id="recover-username" label="Usuario" error={errors.username}>
              <Input
                id="recover-username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={errors.username ? true : undefined}
              />
            </Field>
            <Field
              id="recover-code"
              label="Código de recuperación"
              hint="Ej.: ABCD-EFGH-JKLM"
              error={errors.recoveryCode}
            >
              <Input
                id="recover-code"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-invalid={errors.recoveryCode ? true : undefined}
              />
            </Field>
            <Field
              id="recover-new-password"
              label="Contraseña nueva"
              hint={`Al menos ${MIN_LENGTH} caracteres.`}
              error={errors.newPassword}
            >
              <Input
                id="recover-new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                aria-invalid={errors.newPassword ? true : undefined}
              />
            </Field>
            <Field id="recover-confirm" label="Repite la contraseña nueva" error={errors.confirm}>
              <Input
                id="recover-confirm"
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
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            ¿No tienes código? Comunícate con quien te entregó la cuenta.
          </p>
          <Link
            href="/login"
            className={buttonVariants({ variant: 'ghost', className: 'self-center' })}
          >
            Volver a iniciar sesión
          </Link>
        </>
      )}
    </div>
  );
}
