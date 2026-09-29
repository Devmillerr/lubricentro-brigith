import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApp } from './app.factory';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
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
