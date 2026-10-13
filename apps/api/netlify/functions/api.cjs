// Netlify Function (formato Lambda v1, `handler(event, context)`): toda la API Nest.
// Es el equivalente de `api/index.js` en Vercel. El bundle `dist/serverless.cjs`
// (scripts/bundle-serverless.mjs) exporta un handler (req, res) de Node y
// serverless-http traduce el evento de Lambda a esa petición.
const serverless = require('serverless-http');
const nodeHandler = require('../../dist/serverless.cjs').default;

// Mismo content-type que ProblemDetailsFilter (Express .json()).
const PROBLEM_JSON = 'application/json; charset=utf-8';

const handle = serverless(nodeHandler, {
  // Llamada directa a /.netlify/functions/api/...: se quita el prefijo. Si la
  // petición llega por la reescritura de netlify.toml, la ruta original ya viene en event.path.
  basePath: '/.netlify/functions/api',
  request(req) {
    // serverless-http entrega el cuerpo ya leído (Buffer) y marca la petición
    // como completa, así que body-parser de Express no lo procesa: se hace aquí.
    const raw = req.body;
    if (Buffer.isBuffer(raw) && raw.length && /json/i.test(req.headers['content-type'] || '')) {
      req.body = JSON.parse(raw.toString('utf8')); // validado antes en checkBody()
      req._body = true;
    } else if (Buffer.isBuffer(raw) && !raw.length) {
      req.body = undefined;
    }
  },
});

// Mismo límite que body-parser de Express (100 kb), que aquí no interviene.
const MAX_BODY_BYTES = 100 * 1024;

function problem(status, title, detail, code) {
  // Mismo formato (RFC 9457) que ProblemDetailsFilter.
  return {
    statusCode: status,
    headers: { 'content-type': PROBLEM_JSON, 'cache-control': 'no-store' },
    body: JSON.stringify({ type: 'about:blank', title, status, detail, code }),
  };
}

/** Rechaza antes de llegar a Nest un cuerpo demasiado grande o un JSON inválido. */
function checkBody(event) {
  if (!event.body) return undefined;
  const raw = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
  if (raw.length > MAX_BODY_BYTES) {
    return problem(
      413,
      'Payload Too Large',
      'El cuerpo de la petición es demasiado grande.',
      'PAYLOAD_TOO_LARGE',
    );
  }
  const headers = event.headers || {};
  const type = headers['content-type'] || headers['Content-Type'] || '';
  if (!/json/i.test(type)) return undefined;
  try {
    JSON.parse(raw.toString('utf8'));
    return undefined;
  } catch {
    return problem(
      400,
      'Bad Request',
      'El cuerpo de la petición no es JSON válido.',
      'BAD_REQUEST',
    );
  }
}

module.exports.handler = async (event, context) => {
  // El pool de pg mantiene sockets abiertos: no se espera a que el event loop quede vacío.
  context.callbackWaitsForEmptyEventLoop = false;
  const rejected = checkBody(event);
  if (rejected) return rejected;
  // serverless-http toma la IP del cliente (req.ip, usada por el rate limit de
  // DEC-86) de requestContext.identity.sourceIp y falla si no existe. Netlify
  // pone la IP real en x-nf-client-connection-ip, que el cliente no puede
  // falsificar; por eso la API corre con TRUST_PROXY=0 en Netlify.
  const headers = event.headers || {};
  const clientIp = headers['x-nf-client-connection-ip'] || event.requestContext?.identity?.sourceIp;
  event.requestContext = {
    ...event.requestContext,
    identity: { ...event.requestContext?.identity, sourceIp: clientIp || 'unknown' },
  };
  return handle(event, context);
};
