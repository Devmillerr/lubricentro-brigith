'use client';

import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type SheetAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Acción que retira algo (Desactivar): va al final y en rojo, nunca como botón grande en la fila. */
  danger?: boolean;
};

/**
 * Botón "⋯" de una fila que abre una hoja inferior con sus acciones (subir,
 * bajar, editar, desactivar). En el teléfono la hoja sube desde abajo, al
 * alcance del pulgar; desde `md` es un cuadro centrado. Es un <dialog> nativo:
 * atrapa el foco, Esc lo cierra y al cerrar el foco vuelve al botón.
 */
export function RowActions({
  title,
  actions,
  disabled = false,
}: {
  /** Nombre de lo que se edita: encabeza la hoja y completa la etiqueta del botón. */
  title: string;
  actions: SheetAction[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  function choose(action: SheetAction) {
    setOpen(false);
    action.onSelect();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`Opciones de ${title}`}
        aria-haspopup="dialog"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:opacity-50"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      <dialog
        ref={dialog}
        aria-label={title}
        onClose={() => setOpen(false)}
        // Tocar el fondo (fuera de la hoja) la cierra.
        onClick={(event) => event.target === event.currentTarget && setOpen(false)}
        className="mx-auto mt-auto mb-0 w-full max-w-none rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--foreground)] backdrop:bg-black/40 md:my-auto md:max-w-sm md:rounded-2xl"
      >
        <div className="flex flex-col gap-1 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <span
            className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--border-strong)] md:hidden"
            aria-hidden
          />
          <p className="truncate px-2 pb-2 text-sm font-semibold text-[var(--muted-foreground)]">
            {title}
          </p>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => choose(action)}
                disabled={action.disabled}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-md px-2 text-left text-base font-medium hover:bg-[var(--muted)] disabled:opacity-40',
                  action.danger && 'text-[var(--danger)]',
                )}
              >
                {Icon && <Icon className="size-5 shrink-0" aria-hidden />}
                {action.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 flex min-h-12 items-center justify-center rounded-md border border-[var(--border-strong)] text-base font-semibold hover:bg-[var(--muted)]"
          >
            Cancelar
          </button>
        </div>
      </dialog>
    </>
  );
}
