'use client';

import { Check, Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Código de recuperación recién generado. La API lo devuelve una sola vez y
 * solo guarda su hash: si se pierde, no hay forma de volver a verlo.
 */
export function RecoveryCodeNotice({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles: el código sigue visible para copiarlo a mano.
    }
  }

  return (
    <section
      aria-labelledby="recovery-code-title"
      className="flex flex-col gap-3 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent-soft)] p-4"
    >
      <h3 id="recovery-code-title" className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="size-5 text-[var(--accent-strong)]" aria-hidden />
        Tu código de recuperación
      </h3>
      <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-center font-mono text-xl font-semibold tracking-widest break-all select-all">
        {code}
      </p>
      <p className="text-sm">
        Guárdalo en un lugar seguro. Es la única forma de recuperar tu contraseña si la olvidas y{' '}
        <strong>no se volverá a mostrar</strong>. Cada código sirve una sola vez.
      </p>
      <Button type="button" variant="outline" onClick={copy}>
        {copied ? (
          <Check className="mr-2 size-4" aria-hidden />
        ) : (
          <Copy className="mr-2 size-4" aria-hidden />
        )}
        {copied ? 'Copiado' : 'Copiar código'}
      </Button>
    </section>
  );
}
