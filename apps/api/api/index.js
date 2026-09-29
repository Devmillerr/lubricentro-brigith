// Función de Vercel: toda la API (ver `scripts/bundle-serverless.mjs` y
// `src/serverless.ts`). `vercel.json` reescribe todas las rutas hacia aquí.
module.exports = require('../dist/serverless.cjs').default;
