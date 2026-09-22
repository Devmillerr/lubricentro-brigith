import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';

// `eslint-config-next` 16 exporta configs planas (flat config) nativas, así
// que se importan directo. `FlatCompat.extends('next/core-web-vitals', ...)`
// (pensado para configs `.eslintrc` heredadas) fallaba con "Converting
// circular structure to JSON" al intentar validar un plugin que ya viene en
// formato plano contra el esquema antiguo.
export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  eslintConfigPrettier,
  {
    ignores: ['.next/**', 'node_modules/**', 'src/lib/api/generated/**'],
  },
];
