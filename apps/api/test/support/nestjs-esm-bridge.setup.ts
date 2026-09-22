import * as nestCommon from '@nestjs/common';
import * as nestCore from '@nestjs/core';

/**
 * Precarga `@nestjs/common` y `@nestjs/core` (solo ESM) en el registro de
 * módulos del test y los expone para los paquetes CommonJS que los
 * `require`-an (hoy solo `@nestjs/throttler`). Ver `nestjs-esm-bridge.cjs`.
 */
(globalThis as Record<symbol, unknown>)[Symbol.for('brigith.jest.nestjs-esm-bridge')] = {
  '@nestjs/common': nestCommon,
  '@nestjs/core': nestCore,
};
