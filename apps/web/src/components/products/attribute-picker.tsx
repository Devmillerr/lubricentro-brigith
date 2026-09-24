'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import type { ProductFacets } from '@/lib/products/format';

type FacetValue = ProductFacets['brands'][number];

/**
 * Elegir en vez de escribir (BR-P19b): muestra como chips los valores ya
 * usados y los confirmados por el dueño; "Otro…" abre un campo para uno
 * nuevo. Tocar el chip elegido lo quita (el valor es opcional).
 */
export function AttributePicker({
  id,
  label,
  value,
  options,
  maxLength,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: FacetValue[];
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const known = options.some((option) => sameValue(option.value, value));
  const [typing, setTyping] = useState(Boolean(value) && !known);

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">
        {label}
        <span className="ml-1 font-normal text-[var(--muted-foreground)]">(opcional)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = !typing && sameValue(option.value, value);
          return (
            <Chip
              key={option.value}
              selected={selected}
              onClick={() => {
                setTyping(false);
                onChange(selected ? '' : option.value);
              }}
            >
              {option.value}
            </Chip>
          );
        })}
        <Chip
          selected={typing}
          onClick={() => {
            setTyping((current) => !current);
            if (known) onChange('');
          }}
        >
          Otro…
        </Chip>
      </div>
      {typing && (
        <Input
          id={id}
          aria-label={`${label}: otro valor`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          autoComplete="off"
        />
      )}
    </fieldset>
  );
}

function sameValue(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');
}
