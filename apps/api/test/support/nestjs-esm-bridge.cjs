/**
 * Transformer de Jest aplicado solo a `@nestjs/throttler/dist/*.js`.
 *
 * `@nestjs/throttler` (6.x, la última) se publica solo como CommonJS y hace
 * `require('@nestjs/common')` / `require('@nestjs/core')`, que en Nest 12 son
 * solo ESM. Node 22 resuelve ese `require(esm)` de forma nativa (por eso la
 * API arranca bien), pero Jest 30 solo lo soporta en Node >= 24.9
 * (`SourceTextModule#hasAsyncGraph`) y el proyecto fija Node 22 (`.nvmrc`).
 *
 * En vez de degradar la configuración ESM, este transformer reemplaza esos dos
 * `require` por los namespaces ESM que `nestjs-esm-bridge.setup.ts` ya importó
 * en el mismo registro de módulos del test: throttler recibe exactamente la
 * misma instancia de `@nestjs/common`/`@nestjs/core` que usa la app.
 */
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');

const BRIDGE_KEY = 'brigith.jest.nestjs-esm-bridge';
const ESM_ONLY_REQUIRE = /require\((["'])(@nestjs\/(?:common|core))\1\)/g;
const SELF_SOURCE = readFileSync(__filename, 'utf8');

function process(sourceText) {
  const code = sourceText.replace(ESM_ONLY_REQUIRE, (_match, _quote, specifier) => {
    const lookup = `globalThis[Symbol.for(${JSON.stringify(BRIDGE_KEY)})]`;
    return (
      `(${lookup} && ${lookup}[${JSON.stringify(specifier)}] || (() => { throw new Error(` +
      JSON.stringify(
        `nestjs-esm-bridge: ${specifier} no está precargado; falta test/support/nestjs-esm-bridge.setup.ts en setupFilesAfterEnv`,
      ) +
      `); })())`
    );
  });
  return { code };
}

function getCacheKey(sourceText, sourcePath) {
  return createHash('sha256')
    .update(SELF_SOURCE)
    .update('\0')
    .update(sourcePath)
    .update('\0')
    .update(sourceText)
    .digest('hex');
}

module.exports = { process, getCacheKey, BRIDGE_KEY };
