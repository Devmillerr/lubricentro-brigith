import { UserRound } from 'lucide-react';
import { present } from '@/lib/customers/format';
import { cn } from '@/lib/utils';

/**
 * Avatar genérico del cliente: sus iniciales si tiene nombre o, si no, el
 * ícono de una persona. No hay fotos de clientes, así que nunca se muestra
 * una imagen que pueda tomarse por la persona real.
 */
export function CustomerAvatar({
  name,
  size = 'md',
}: {
  name: string | null | undefined;
  size?: 'md' | 'lg';
}) {
  const initials = initialsOf(present(name));
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[var(--muted)] font-semibold text-[var(--muted-foreground)]',
        size === 'lg' ? 'size-14 text-lg' : 'size-10 text-sm',
      )}
    >
      {initials ?? <UserRound className={size === 'lg' ? 'size-7' : 'size-5'} strokeWidth={1.75} />}
    </span>
  );
}

function initialsOf(name: string | null): string | null {
  if (!name) return null;
  const letters = name
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word[0] ?? ''))
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase('es'));
  return letters.length > 0 ? letters.join('') : null;
}
