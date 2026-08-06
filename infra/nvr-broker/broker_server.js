#!/usr/bin/env node
// broker_server.js — Broker de acceso al NVR Shinobi para el cliente LaboRemoto.
//
// Corre EN LA PI (localhost, nunca expuesto directo — se llega por el tunel
// SSH inverso hacia AWS + nginx, igual que Keycloak). La SHINOBI_API_KEY
// real vive solo aqui, nunca viaja a ningun cliente instalado.
//
// Rutas:
//   GET /nvr/monitor/:groupKey
//     Requiere: Authorization: Bearer <jwt de Keycloak>
//     Devuelve el mismo JSON que Shinobi, pero con las stream_url
//     reescritas para usar un token opaco de sesion en vez de la
//     SHINOBI_API_KEY real.
//   GET /nvr/hls/:token/*
//     Proxya hacia Shinobi real usando la SHINOBI_API_KEY real,
//     solo si :token es un token de sesion valido y no vencido
//     (emitido por /nvr/monitor tras validar el JWT).
//
// Config: variables de entorno SHINOBI_API_KEY, SHINOBI_LOCAL_PORT (8082),
// PORT (puerto donde escucha este broker, default 8091),
// KEYCLOAK_JWKS_URL, KEYCLOAK_ISSUER.

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8091;
const SHINOBI_API_KEY = process.env.SHINOBI_API_KEY;
const SHINOBI_LOCAL_PORT = process.env.SHINOBI_LOCAL_PORT || 8082;
const JWKS_URL = process.env.KEYCLOAK_JWKS_URL
  || 'http://52.14.162.232/auth/realms/laboratorio-semillero/protocol/openid-connect/certs';
const ISSUER = process.env.KEYCLOAK_ISSUER
  || 'http://52.14.162.232/auth/realms/laboratorio-semillero';
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min, se renueva en cada /monitor

if (!SHINOBI_API_KEY) {
  console.error('[nvr-broker] Falta SHINOBI_API_KEY en el entorno');
  process.exit(1);
}

// ── Sesiones opacas (token -> expiresAt) ──
// El cliente hace polling de /nvr/monitor cada 5s (useNvrCameras) — si
// emitieramos un token nuevo en cada poll, el stream_url cambiaria de
// string en cada respuesta y el reproductor HLS del cliente se reiniciaria
// cada 5s (exactamente el sintoma "se ve 5s y se cae"). Por eso el token se
// reutiliza mientras siga vigente para el mismo usuario+groupKey, y solo se
// renueva (mismo valor, TTL extendido) o se emite uno nuevo si vencio.
const sessions = new Map();       // token -> expiresAt
const sessionByKey = new Map();   // "username:groupKey" -> token

function getOrCreateSessionToken(sessionKey) {
  const existing = sessionByKey.get(sessionKey);
  if (existing && isValidSession(existing)) {
    sessions.set(existing, Date.now() + SESSION_TTL_MS); // renovar TTL
    return existing;
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  sessionByKey.set(sessionKey, token);
  return token;
}

function isValidSession(token) {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}

// GC simple de sesiones vencidas
setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of sessions) if (now > exp) sessions.delete(token);
  for (const [key, token] of sessionByKey) if (!sessions.has(token)) sessionByKey.delete(key);
}, 60_000).unref();

// ── Validación de JWT (misma lógica que verify_jwt.js) ──
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

let jwksCache = null;
let jwksCacheAt = 0;
async function getJwks() {
  if (jwksCache && Date.now() - jwksCacheAt < 5 * 60_000) return jwksCache;
  jwksCache = await fetchJson(JWKS_URL);
  jwksCacheAt = Date.now();
  return jwksCache;
}

async function verifyJwt(jwt) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('JWT mal formado');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlToBuf(headerB64).toString('utf8'));
  const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
  if (header.alg !== 'RS256') throw new Error(`alg no soportado: ${header.alg}`);

  const jwks = await getJwks();
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`kid no encontrado en JWKS`);

  const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    b64urlToBuf(sigB64),
  );
  if (!ok) throw new Error('firma invalida');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('token expirado');
  if (payload.iss !== ISSUER) throw new Error(`issuer inesperado: ${payload.iss}`);

  return payload.preferred_username || payload.sub;
}

// ── Proxy hacia Shinobi real ──
// `token` es el token opaco de sesion que se le devolvio al cliente — se usa
// para reescribir cualquier referencia a la API key real que Shinobi meta
// dentro del propio manifest .m3u8 (por si trae rutas absolutas).
function proxyToShinobi(shinobiPath, token, res) {
  const options = { host: '127.0.0.1', port: SHINOBI_LOCAL_PORT, path: shinobiPath, method: 'GET' };
  const upstream = http.request(options, (upRes) => {
    const contentType = upRes.headers['content-type'] || '';
    if (contentType.includes('mpegurl') || shinobiPath.endsWith('.m3u8')) {
      // Manifest de texto: reescribir la API key real si aparece embebida
      let body = '';
      upRes.on('data', (c) => { body += c; });
      upRes.on('end', () => {
        const rewritten = body.split(`/${SHINOBI_API_KEY}/`).join(`/nvr/hls/${token}/`);
        res.writeHead(upRes.statusCode, { 'Content-Type': contentType });
        res.end(rewritten);
      });
    } else {
      res.writeHead(upRes.statusCode, { 'Content-Type': contentType });
      upRes.pipe(res);
    }
  });
  upstream.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream_error', message: e.message }));
  });
  upstream.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean); // ['nvr', 'monitor', groupKey] o ['nvr','hls',token,...]

  console.log(`[nvr-broker] ${req.method} ${url.pathname}`);

  // CORS: el cliente Tauri (hls.js/fetch corriendo en el webview) ahora
  // consulta un host externo real en vez de 127.0.0.1 — sin estas cabeceras
  // el webview bloquea la respuesta como cross-origin, aunque el broker
  // haya respondido bien (por eso las camaras se quedaban en "Conectando...").
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'GET') {
    res.writeHead(405); return res.end();
  }

  // GET /nvr/monitor/:groupKey
  if (parts.length === 3 && parts[0] === 'nvr' && parts[1] === 'monitor') {
    const groupKey = decodeURIComponent(parts[2]);
    const auth = req.headers['authorization'] || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!jwt) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'missing_bearer_token' }));
    }

    let username;
    try {
      username = await verifyJwt(jwt);
    } catch (e) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_jwt', message: e.message }));
    }

    const shinobiPath = `/${SHINOBI_API_KEY}/monitor/${encodeURIComponent(groupKey)}`;
    http.get({ host: '127.0.0.1', port: SHINOBI_LOCAL_PORT, path: shinobiPath }, (upRes) => {
      let body = '';
      upRes.on('data', (c) => { body += c; });
      upRes.on('end', () => {
        let monitors;
        try { monitors = JSON.parse(body); } catch { monitors = null; }
        if (!Array.isArray(monitors)) {
          res.writeHead(upRes.statusCode, { 'Content-Type': 'application/json' });
          return res.end(body);
        }
        const token = getOrCreateSessionToken(`${username}:${groupKey}`);
        console.log(`[nvr-broker] sesion (re)usada para usuario=${username} groupKey=${groupKey}`);
        const rewritten = monitors.map((m) => ({
          ...m,
          streams: (m.streams || []).map((s) => s.replace(`/${SHINOBI_API_KEY}/`, `/nvr/hls/${token}/`)),
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rewritten));
      });
    }).on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'shinobi_unreachable', message: e.message }));
    });
    return;
  }

  // GET /nvr/hls/:token/...resto...
  if (parts.length >= 4 && parts[0] === 'nvr' && parts[1] === 'hls') {
    const token = parts[2];
    if (!isValidSession(token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_or_expired_session' }));
    }
    const rest = parts.slice(3).join('/');
    const shinobiPath = `/${SHINOBI_API_KEY}/${rest}${url.search}`;
    return proxyToShinobi(shinobiPath, token, res);
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[nvr-broker] escuchando en http://127.0.0.1:${PORT}`);
});
