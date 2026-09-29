import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Genera openapi.json sin levantar un servidor HTTP. `apps/web` lo consume
 * con openapi-typescript para generar el cliente tipado (04-ARCHITECTURE.md §3).
 * Usa la misma configuración que `main.ts` (ver openapi-document.ts).
 *
 * No se conecta a la base ni firma tokens, así que, si faltan, completa las
 * variables obligatorias con valores ficticios: el build de `apps/web` (p. ej.
 * en Vercel) genera el contrato sin tener secretos de la API.
 */
const PLACEHOLDER_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://openapi:openapi@localhost:5432/openapi',
  CORS_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'openapi-placeholder-not-a-secret',
  JWT_REFRESH_SECRET: 'openapi-placeholder-not-a-secret',
};
async function main(): Promise<void> {
  for (const [name, value] of Object.entries(PLACEHOLDER_ENV)) process.env[name] ??= value;
  // Import diferido: la validación del entorno corre al cargar AppModule.
  const { AppModule } = await import('../src/app.module');
  const { applyGlobalPrefix, createOpenApiDocument } =
    await import('../src/common/openapi/openapi-document');

  const app = await NestFactory.create(AppModule, { logger: false });
  applyGlobalPrefix(app);
  const document = createOpenApiDocument(app);

  const outPath = resolve(__dirname, '../../../openapi.json');
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI escrito en ${outPath}`);

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
