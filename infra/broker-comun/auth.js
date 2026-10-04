// auth.js — validación del JWT de Keycloak, compartida por todos los brokers.
//
// Valida firma RS256 contra el JWKS del realm (con caché de 5 min), expiración e issuer. Es la misma lógica que
// antes vivía dentro de broker_server.js; cada servicio valida el token por su cuenta (nadie confía en que "otro
// servicio ya lo validó"), por eso es una librería y no un servicio.
//
// Config (env, comunes a todos): KEYCLOAK_JWKS_URL, KEYCLOAK_ISSUER.

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

const JWKS_TTL_MS = 5 * 60_000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout JWKS')));
  });
}

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Config desde el entorno, con los valores del realm institucional como respaldo. */
function configDesdeEnv() {
  return {
    jwksUrl: process.env.KEYCLOAK_JWKS_URL
      || 'http://52.14.162.232/auth/realms/laboratorio-semillero/protocol/openid-connect/certs',
    issuer: process.env.KEYCLOAK_ISSUER
      || 'http://52.14.162.232/auth/realms/laboratorio-semillero',
  };
}

/**
 * Devuelve `verifyJwt(jwt) -> claims` (lanza Error si no es válido).
 * `ahora` (ms) se inyecta para pruebas.
 */
function crearVerificador({ jwksUrl, issuer, ahora = Date.now }) {
  let cache = null;
  let cacheEn = 0;

  async function getJwks() {
    if (cache && ahora() - cacheEn < JWKS_TTL_MS) return cache;
    cache = await fetchJson(jwksUrl);
    cacheEn = ahora();
    return cache;
  }

  return async function verifyJwt(jwt) {
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new Error('JWT mal formado');
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(b64urlToBuf(headerB64).toString('utf8'));
    const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
    if (header.alg !== 'RS256') throw new Error(`alg no soportado: ${header.alg}`);

    const jwks = await getJwks();
    const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('kid no encontrado en JWKS');

    const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${headerB64}.${payloadB64}`),
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      b64urlToBuf(sigB64),
    );
    if (!ok) throw new Error('firma invalida');

    const ahoraS = Math.floor(ahora() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < ahoraS) throw new Error('token expirado');
    if (payload.iss !== issuer) throw new Error(`issuer inesperado: ${payload.iss}`);

    return payload; // el llamador decide qué campos necesita (sub, preferred_username, realm_access…)
  };
}

/** Token del encabezado `Authorization: Bearer …`, o null. */
function tokenDeBearer(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * Exige un JWT válido: devuelve los claims, o responde 401 y devuelve null (el llamador debe cortar).
 */
async function exigirJwt(req, res, verifyJwt) {
  const jwt = tokenDeBearer(req);
  if (!jwt) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'missing_bearer_token' }));
    return null;
  }
  try {
    return await verifyJwt(jwt);
  } catch (e) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_jwt', message: e.message }));
    return null;
  }
}

module.exports = { configDesdeEnv, crearVerificador, tokenDeBearer, exigirJwt };
