import { WifiOff } from 'lucide-react';

// Sin imágenes: esta pantalla se sirve desde la caché del service worker, sin red.
export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-[var(--accent-soft)]">
        <WifiOff className="size-7 text-[var(--accent-strong)]" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Sin conexión</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Brigith necesita internet para trabajar. Revisa tu conexión e inténtalo de nuevo.
        </p>
      </div>
    </div>
  );
}
