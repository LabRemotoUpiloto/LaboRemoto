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
//     SHINOBI_API_KEY real. Cada monitor trae ademas `ptz: true/false`
//     segun si esta en PTZ_CAMERAS (ver mas abajo).
//   GET /nvr/hls/:token/*    
//     Proxya hacia Shinobi real usando la SHINOBI_API_KEY real,
//     solo si :token es un token de sesion valido y no vencido
//     (emitido por /nvr/monitor tras validar el JWT).
//   POST /nvr/ptz/:groupKey/:mid
//     Requiere: Authorization: Bearer <jwt de Keycloak> con rol
//     admin_lab, laboratorista o semillerista (realm_access.roles). Body JSON
//     {"op": "Left"|"Right"|...|"Stop"|"ZoomInc"|"ZoomDec", "speed"?: n}.
//     Traduce :mid a la camara Reolink real (IP+credenciales, nunca
//     expuestas al cliente) y reenvia el comando PTZ via su API HTTP.
//
// Config: variables de entorno SHINOBI_API_KEY, SHINOBI_LOCAL_PORT (8082),
// PORT (puerto donde escucha este broker, default 8091),
// KEYCLOAK_JWKS_URL, KEYCLOAK_ISSUER, PTZ_CAMERAS_JSON (mapa mid -> camara
// Reolink real, ver seccion PTZ mas abajo).

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

  return payload; // el caller decide que campos necesita (sub, roles, ...)
}

// ── PTZ (control de camaras Reolink con soporte PTZ) ──
// No todas las camaras del NVR son fisicamente PTZ, y de las que lo son no
// todas tienen su API HTTP de Reolink alcanzable en la red (algunas solo
// exponen el puerto RTSP 554 hacia Shinobi). Este mapa es la fuente de la
// verdad de "cuales camaras aceptan control" — mid -> {host, user, pass}.
// Se carga por env var (nunca hardcodeado en el fuente, mismo criterio que
// SHINOBI_API_KEY), ej.:
//   PTZ_CAMERAS_JSON='{"Camara1":{"host":"172.16.118.115","user":"admin","pass":"..."}}'
let PTZ_CAMERAS = {};
try {
  PTZ_CAMERAS = JSON.parse(process.env.PTZ_CAMERAS_JSON || '{}');
} catch (e) {
  console.error('[nvr-broker] PTZ_CAMERAS_JSON invalido:', e.message);
}

const PTZ_OPS = new Set([
  'Left', 'Right', 'Up', 'Down',
  'LeftUp', 'LeftDown', 'RightUp', 'RightDown',
  'ZoomInc', 'ZoomDec', 'Stop',
]);

const ptzTokens = new Map(); // mid -> { token, expiresAt }

function reolinkPost(host, path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      host,
      port: 80,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (upRes) => {
      let data = '';
      upRes.on('data', (c) => { data += c; });
      upRes.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('respuesta invalida de la camara')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout de la camara')));
    req.write(body);
    req.end();
  });
}

async function getPtzToken(mid, cam) {
  const cached = ptzTokens.get(mid);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const resp = await reolinkPost(cam.host, '/cgi-bin/api.cgi?cmd=Login', [{
    cmd: 'Login',
    param: { User: { Version: '0', userName: cam.user, password: cam.pass } },
  }]);
  const token = resp?.[0]?.value?.Token?.name;
  if (!token) throw new Error(resp?.[0]?.error?.detail || 'login PTZ fallido');
  // leaseTime real reportado por la camara es 3600s -- cacheamos con margen
  // para renovar antes de que la camara lo expire del otro lado.
  ptzTokens.set(mid, { token, expiresAt: Date.now() + 30 * 60 * 1000 });
  return token;
}

async function sendPtzCommand(mid, cam, op, speed) {
  const attempt = async () => {
    const token = await getPtzToken(mid, cam);
    return reolinkPost(cam.host, `/cgi-bin/api.cgi?cmd=PtzCtrl&token=${token}`, [{
      cmd: 'PtzCtrl',
      param: { channel: 0, op, speed },
    }]);
  };

  let resp = await attempt();
  if (resp?.[0]?.error) {
    // El token puede haber quedado invalido del lado de la camara (reinicio,
    // etc.) sin que nuestro cache lo supiera -- un reintento con token fresco
    // cubre ese caso sin que el usuario vea el error.
    ptzTokens.delete(mid);
    resp = await attempt();
  }
  if (resp?.[0]?.error) throw new Error(resp[0].error.detail || 'comando PTZ rechazado por la camara');
  return resp;
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // GET /nvr/monitor/:groupKey
  if (req.method === 'GET' && parts.length === 3 && parts[0] === 'nvr' && parts[1] === 'monitor') {
    const groupKey = decodeURIComponent(parts[2]);
    const auth = req.headers['authorization'] || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!jwt) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'missing_bearer_token' }));
    }

    let claims;
    try {
      claims = await verifyJwt(jwt);
    } catch (e) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_jwt', message: e.message }));
    }
    const username = claims.preferred_username || claims.sub;

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
          ptz: Object.prototype.hasOwnProperty.call(PTZ_CAMERAS, m.mid),
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
  if (req.method === 'GET' && parts.length >= 4 && parts[0] === 'nvr' && parts[1] === 'hls') {
    const token = parts[2];
    if (!isValidSession(token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_or_expired_session' }));
    }
    const rest = parts.slice(3).join('/');
    const shinobiPath = `/${SHINOBI_API_KEY}/${rest}${url.search}`;
    return proxyToShinobi(shinobiPath, token, res);
  }

  // POST /nvr/ptz/:groupKey/:mid
  if (req.method === 'POST' && parts.length === 4 && parts[0] === 'nvr' && parts[1] === 'ptz') {
    const mid = decodeURIComponent(parts[3]);
    const auth = req.headers['authorization'] || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!jwt) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'missing_bearer_token' }));
    }

    let claims;
    try {
      claims = await verifyJwt(jwt);
    } catch (e) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_jwt', message: e.message }));
    }

    // PTZ mueve hardware real -- a diferencia de /nvr/monitor (solo lectura),
    // aca si se exige rol, igual que el acceso a "Vigilancia" en el frontend
    // (usePermissions.PAGE_ACCESS['vigilancia']: tier 'operativo' -- admin_lab,
    // laboratorista o semillerista).
    const roles = claims.realm_access?.roles || [];
    if (!roles.includes('admin_lab') && !roles.includes('laboratorista') && !roles.includes('semillerista')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'forbidden', message: 'PTZ requiere rol admin_lab, laboratorista o semillerista' }));
    }

    const cam = PTZ_CAMERAS[mid];
    if (!cam) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'ptz_not_supported', mid }));
    }

    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = {}; }
      const op = parsed.op;
      const speed = Number.isFinite(parsed.speed) ? Math.max(1, Math.min(8, parsed.speed)) : 4;
      if (!PTZ_OPS.has(op)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'invalid_op', op }));
      }
      try {
        await sendPtzCommand(mid, cam, op, speed);
        console.log(`[nvr-broker] PTZ ${op} mid=${mid} usuario=${claims.preferred_username || claims.sub}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ptz_camera_error', message: e.message }));
      }
    });
    return;
  }

  res.writeHead(req.method === 'GET' || req.method === 'POST' ? 404 : 405);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[nvr-broker] escuchando en http://127.0.0.1:${PORT}`);
});
