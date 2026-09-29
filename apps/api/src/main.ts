import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { applyGlobalPrefix, createOpenApiDocument } from './common/openapi/openapi-document';
import { validationExceptionFactory } from './common/validation-exception-factory';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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

  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    `API escuchando en http://localhost:${port}/api/v1 (Swagger en /api/docs)`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    'Error al iniciar la aplicación',
    error instanceof Error ? error.stack : error,
    'Bootstrap',
  );
  process.exitCode = 1;
});
