import { Injectable } from '@nestjs/common';

export interface HitResult {
  allowed: boolean;
  /** Peticiones contadas en la ventana actual, incluida esta si se permitió. */
  count: number;
  /** Segundos hasta que se reinicia la ventana (mínimo 1). */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Contador de ventana fija en memoria (DEC-86): la ventana empieza con la
 * primera petición de la clave y se reinicia entera al vencer. Vale para una
 * sola instancia de la API; con varias haría falta un almacenamiento
 * compartido. Una petición rechazada no suma. Las ventanas vencidas se
 * limpian de forma perezosa, sin temporizadores.
 */
@Injectable()
export class FixedWindowStore {
  private readonly windows = new Map<string, Window>();
  private nextSweepAt = 0;

  hit(key: string, limit: number, windowMs: number, now = Date.now()): HitResult {
    this.sweep(now, windowMs);

    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
    if (window.count >= limit) {
      return { allowed: false, count: window.count, retryAfterSeconds };
    }
    window.count += 1;
    return { allowed: true, count: window.count, retryAfterSeconds };
  }

  /** Cantidad de ventanas guardadas (para pruebas). */
  get size(): number {
    return this.windows.size;
  }

  private sweep(now: number, windowMs: number): void {
    if (now < this.nextSweepAt) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    this.nextSweepAt = now + windowMs;
  }
}
