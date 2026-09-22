import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';

/**
 * Genera openapi.json sin levantar un servidor HTTP. `apps/web` lo consume
 * con openapi-typescript para generar el cliente tipado (04-ARCHITECTURE.md §3).
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Brigith OS API')
    .setDescription('API de Brigith OS. Ver /docs en el repositorio para el diseño completo.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const outPath = resolve(__dirname, '../../../openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  console.log(`OpenAPI escrito en ${outPath}`);

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
