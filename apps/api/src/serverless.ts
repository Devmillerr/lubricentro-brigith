import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.factory';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Promise<Handler> | undefined;

/**
 * Entrada de la API como función de Vercel (`api/index.js`, empaquetada por
 * `scripts/bundle-serverless.mjs`). Crea la aplicación una sola vez por
 * instancia y le pasa cada petición a Express, igual que el servidor de
 * `main.ts` pero sin `listen()`.
 */
export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  handler ??= createApp().then(async (app) => {
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  });
  try {
    (await handler)(req, res);
  } catch (error) {
    handler = undefined;
    throw error;
  }
}
