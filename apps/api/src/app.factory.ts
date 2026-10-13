import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
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

  app.disable('x-powered-by');
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  app.use((_req: Request, res: Response, next: NextFunction) => {
    // Las respuestas llevan datos del negocio: ni el navegador ni proxies las
    // guardan (cerrar sesión no debe dejar ventas o deudas en una caché).
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    // La API solo devuelve JSON. Fuera de producción se omite para Swagger UI.
    if (isProduction) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
    next();
  });

  applyGlobalPrefix(app);

  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
    // La web lee `Retry-After` del 429 (DEC-86).
    exposedHeaders: ['Retry-After'],
    // El navegador recuerda el preflight 2 h (el tope de Chrome): sin esto, cada
    // petición con `Authorization` genera un OPTIONS extra (una invocación más de
    // la función). Solo se cachea el permiso CORS, nunca datos.
    maxAge: 7200,
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
