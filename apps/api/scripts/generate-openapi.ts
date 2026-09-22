import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { applyGlobalPrefix, createOpenApiDocument } from '../src/common/openapi/openapi-document';

/**
 * Genera openapi.json sin levantar un servidor HTTP. `apps/web` lo consume
 * con openapi-typescript para generar el cliente tipado (04-ARCHITECTURE.md §3).
 * Usa la misma configuración que `main.ts` (ver openapi-document.ts).
 */
async function main(): Promise<void> {
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
