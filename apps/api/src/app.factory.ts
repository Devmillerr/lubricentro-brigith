import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { applyGlobalPrefix, createOpenApiDocument } from './common/openapi/openapi-document';
import { validationExceptionFactory } from './common/validation-exception-factory';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import type { Env } from './config/env.validation';

/**
 * Crea y configura la aplicación, sin escuchar en un puerto. La usan
 * `main.ts` (servidor Node) y `serverless.ts` (función de Vercel), para que
 * ambos entornos tengan exactamente la misma configuración.
 *
 * El adaptador de Express se pasa explícito: si no, Nest lo carga con un
 * `import()` dinámico que el bundle serverless no puede resolver.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter());
  const config = app.get(ConfigService<Env, true>);

  // Detrás de un proxy (Vercel), `req.ip` debe salir de `X-Forwarded-For`
  // para que el rate limit por IP (DEC-86) no cuente a todos como uno solo.
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  applyGlobalPrefix(app);

  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
    // La web lee `Retry-After` del 429 (DEC-86).
    exposedHeaders: ['Retry-After'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.useGlobalFilters(new ProblemDetailsFilter());

  // Swagger UI solo fuera de producción: el contrato vive en el repositorio
  // (`openapi.json` generado) y no hace falta exponerlo en la API pública.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
  }

  return app;
}
