import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { applyGlobalPrefix, createOpenApiDocument } from './common/openapi/openapi-document';
import { validationExceptionFactory } from './common/validation-exception-factory';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  applyGlobalPrefix(app);

  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
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
