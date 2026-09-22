import Link from 'next/link';

/**
 * Placeholder de C0. La pantalla real de inicio (entrada de placa) es de C1
 * (08-ROADMAP.md): depende de que existan clientes y vehículos.
 */
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Brigith OS</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        Base del proyecto (C0). La entrada por placa llega en el siguiente corte.
      </p>
      <Link
        href="/login"
        className="inline-flex h-11 items-center justify-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
      >
        Ir a inicio de sesión
      </Link>
    </div>
  );
}
