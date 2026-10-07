'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { isValidUnit } from '@/lib/products/units';

/**
 * Unidad de stock (BR-P15, DEC-92): obligatoria y elegida de una lista
 * (las que ya usa el catálogo y las sugeridas: unidad, galón, litro). "Otra…"
 * abre un campo para escribir una distinta. Una unidad guardada que no es un
 * nombre (p. ej. "0") no se marca como elegida: se avisa y se pide elegir.
 */
export function UnitPicker({
  value,
  options,
  error,
  storedInvalid,
  onChange,
}: {
  value: string;
  options: string[];
  error?: string;
  /** La unidad guardada no es válida (p. ej. "0"): se avisa sin bloquear otros cambios. */
  storedInvalid: string | null;
  onChange: (value: string) => void;
}) {
  const known = options.some((option) => sameValue(option, value));
  const [typing, setTyping] = useState(Boolean(value) && !known && isValidUnit(value));

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold">Unidad de stock</legend>
      <p className="-mt-1 text-xs text-[var(--muted-foreground)]">
        En la que se cuenta y se descuenta del inventario.
      </p>
      {storedInvalid !== null && sameValue(value, storedInvalid) && (
        <p className="rounded-md border border-[var(--accent)]/60 bg-[var(--accent-soft)] px-3 py-2 text-sm">
          La unidad registrada es «{storedInvalid}», que no es una unidad. Elige la correcta: puedes
          guardar otros cambios sin tocarla.
        </p>
      )}
      <div role="group" aria-label="Unidad de stock" className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = !typing && sameValue(option, value);
          return (
            <Chip
              key={option}
              selected={selected}
              onClick={() => {
                setTyping(false);
                onChange(option);
              }}
            >
              {option}
            </Chip>
          );
        })}
        <Chip
          selected={typing}
          onClick={() => {
            setTyping(true);
            if (known || !isValidUnit(value)) onChange('');
          }}
        >
          Otra…
        </Chip>
      </div>
      {typing && (
        <Input
          id="unit"
          aria-label="Unidad de stock: otra"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={50}
          autoComplete="off"
          placeholder="Ej.: caja, par, kit"
          aria-invalid={!!error || undefined}
        />
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function sameValue(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');
}
