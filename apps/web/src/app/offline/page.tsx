export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        Brigith OS necesita internet para trabajar. Revisa tu conexión e inténtalo de nuevo.
      </p>
    </div>
  );
}
