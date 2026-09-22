/**
 * @nestjs/* (v12) se publica solo como ESM ("type": "module", sin build CJS).
 * Node lo carga con `require` de forma nativa (>=22.12), pero Jest necesita
 * correr los tests como ESM real para poder importarlo: de ahí el preset
 * `default-esm` y `NODE_OPTIONS=--experimental-vm-modules` en los scripts de
 * `package.json`. El build de producción (`nest build` + `tsc`) no cambia:
 * sigue compilando a CommonJS, que sí puede hacer `require()` de estos paquetes.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // `tsconfig.json` compila a CommonJS (lo que necesita `nest build`); acá
    // se fuerza a ESM solo para que ts-jest emita `import`/`export`, que es
    // lo que el runtime ESM de Jest espera (si no, sale "exports is not defined").
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: { module: 'esnext' } }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
};
