import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 ya no acepta `url = env("DATABASE_URL")` dentro de `schema.prisma`
// (ver el error de `prisma generate`/`migrate` que apuntaba aquí). La URL de
// conexión vive solo en este archivo y en las variables de entorno.
//
// `prisma generate` no necesita conectarse a la base, así que no usa el
// helper `env()` (que falla duro si falta la variable): con `process.env`
// directo, generar el cliente funciona incluso sin `.env` todavía. `prisma
// migrate`/`db push` sí necesitan una URL real y fallan con un error claro
// si falta.
//
// El CLI (esta config) usa `DIRECT_URL` cuando existe: en Supabase, el
// pooler de transacciones (`DATABASE_URL`, puerto 6543) no soporta los
// prepared statements ni los advisory locks que Prisma Migrate necesita.
// La app en runtime (`PrismaService`) sigue usando `DATABASE_URL` sin
// pasar por aquí.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      'postgresql://invalid/prisma-generate-placeholder',
  },
});
