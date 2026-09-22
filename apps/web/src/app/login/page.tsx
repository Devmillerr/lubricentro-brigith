'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFormDraft } from '@/lib/use-form-draft';

/**
 * Pantalla de inicio de sesión. Todavía no llama a la API: el contrato de
 * `POST /auth/login` está pendiente de una decisión de producto (username
 * único solo por negocio, sin campo que identifique el negocio en el login;
 * ver la pregunta planteada al usuario). El formulario y su persistencia de
 * borrador ya quedan listos para cuando se conecte.
 */
export default function LoginPage() {
  const [draft, setDraft] = useFormDraft('login', { username: '' });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    window.setTimeout(() => setSubmitting(false), 300);
    // TODO(C0 bloqueado): conectar a POST /auth/login cuando se confirme
    // cómo se identifica el negocio en el login.
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Brigith OS</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Inicia sesión para continuar</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-sm font-medium">
            Usuario
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            value={draft.username}
            onChange={(e) => setDraft({ username: e.target.value })}
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
