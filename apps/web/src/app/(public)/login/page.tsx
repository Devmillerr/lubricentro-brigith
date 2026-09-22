'use client';

import { CircleAlert, Info } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { describeError } from '@/lib/api/errors';
import { safeNextPath } from '@/lib/auth/redirect';
import { login, useSession, type LoginResult } from '@/lib/auth/session';
import { useFormDraft } from '@/lib/use-form-draft';

type LoginFailure = Extract<LoginResult, { ok: false }>['reason'];

const FAILURE_MESSAGES: Record<LoginFailure, string> = {
  'invalid-credentials': 'Usuario o contraseña incorrectos.',
  'rate-limited': 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
  validation: 'Ingresa tu usuario y tu contraseña.',
  network: describeError({ kind: 'network' }),
  server: describeError({ kind: 'server', detail: '' }),
};

/**
 * Inicio de sesión con `POST /auth/login` (`{ username, password }`, sin
 * negocio: el username es único globalmente, DEC-25). El usuario escrito se
 * conserva como borrador si falla el envío (04-ARCHITECTURE.md §8).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const nextPath = safeNextPath(useSearchParams().get('next'));
  const session = useSession();
  const [draft, setDraft] = useFormDraft('login', { username: '' });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);

  useEffect(() => {
    if (session.status === 'authenticated') router.replace(nextPath);
  }, [session.status, nextPath, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);

    const result = await login(draft.username.trim(), password);
    if (!result.ok) {
      setFailure(result.reason);
      setSubmitting(false);
    }
    // Con éxito, el efecto de arriba redirige al quedar la sesión autenticada.
  }

  // Mientras se confirma una sesión ya guardada, no mostrar el formulario.
  if (!submitting && (session.status === 'loading' || session.status === 'authenticated')) {
    return <LoadingState />;
  }

  const expired = session.status === 'unauthenticated' && session.reason === 'expired';

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Brigith OS</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Inicia sesión para continuar</p>
      </div>

      {expired && !failure && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Tu sesión venció. Vuelve a iniciar sesión.
        </p>
      )}

      {failure && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {FAILURE_MESSAGES[failure]}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-sm font-medium">
            Usuario
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={draft.username}
            onChange={(e) => setDraft({ username: e.target.value })}
            aria-invalid={failure === 'invalid-credentials' || undefined}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={failure === 'invalid-credentials' || undefined}
            required
          />
        </div>

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </div>
  );
}
