import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Prefijo de la API (06-API.md: "Base /api/v1"); `/health` queda fuera. */
export const API_PREFIX = 'api/v1';

export function applyGlobalPrefix(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
}

/**
 * Documento OpenAPI compartido por `main.ts` (Swagger UI) y
 * `scripts/generate-openapi.ts` (contrato que consume `apps/web`), para que
 * no puedan divergir. Las rutas son relativas al servidor `/api/v1`, igual
 * que `NEXT_PUBLIC_API_URL` en `apps/web`.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Brigith API')
    .setDescription('API de Brigith. Ver /docs en el repositorio para el diseño completo.')
    .setVersion('0.1.0')
    .addServer(`/${API_PREFIX}`)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, { ignoreGlobalPrefix: true });
}
