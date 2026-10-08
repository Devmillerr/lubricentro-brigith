import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Pruebas de funciones puras de `src/lib` (formato de dinero, fechas): sin
 * navegador ni React. El alias `@/` es el mismo del tsconfig.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
