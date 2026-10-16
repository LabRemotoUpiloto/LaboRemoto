// camaras.js — acceso a las cámaras (Shinobi) sin exponer la SHINOBI_API_KEY real ni las claves de las cámaras.
//
//   GET  /nvr/monitor/:groupKey          Authorization: Bearer <JWT Keycloak>
//     Consulta Shinobi real y devuelve el mismo JSON con las `streams` reescritas hacia /nvr/hls/:token/...
//     (una sesión opaca de 15 min, reutilizada por usuario+grupo) y marca cada cámara con `ptz` y `webrtc`.
//   GET  /nvr/hls/:token/...             proxy hacia Shinobi, solo con una sesión vigente
//   POST /nvr/ptz/:groupKey/:mid         control PTZ de cámaras Reolink; exige rol de personal
//   POST /nvr/whep/:path                 negociación WebRTC hacia MediaMTX (ver webrtc.js)
//
// Config (env): SHINOBI_API_KEY (obligatoria), SHINOBI_LOCAL_PORT (8082), PTZ_CAMERAS_JSON, WEBRTC_PATHS_JSON,
// MEDIAMTX_WEBRTC_PORT. Las de Keycloak son comunes (broker-comun/auth.js).

const http = require('node:http');
const crypto = require('node:crypto');
const { exigirJwt } = require('../broker-comun/auth');
const webrtc = require('./webrtc');

const SHINOBI_API_KEY = process.env.SHINOBI_API_KEY;
const SHINOBI_LOCAL_PORT = process.env.SHINOBI_LOCAL_PORT || 8082;
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min, se renueva en cada /monitor

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
  console.error('[camaras] PTZ_CAMERAS_JSON invalido:', e.message);
}

// Con el registro de cámaras (registro.js) el mapa PTZ sale de ahí y cambia sin reiniciar; sin él se usa el de env.
let fuentePtz = () => PTZ_CAMERAS;
const ptzCams = () => fuentePtz();
function usarRegistro(registro) {
  fuentePtz = () => (registro.camaras.length ? registro.mapaPtz() : PTZ_CAMERAS);
  webrtc.usarMapa(() => (registro.camaras.length ? registro.mapaWebrtc() : null));
}

const PTZ_OPS = new Set([
  'Left', 'Right', 'Up', 'Down',
  'LeftUp', 'LeftDown', 'RightUp', 'RightDown',
  'ZoomInc', 'ZoomDec', 'Stop',
]);

// Debe coincidir con los roles de personal de usePermissions.ts (STAFF).
const PTZ_ROLES = [
  'admin_lab', 'jefe_laboratorio', 'coordinador_laboratorio',
  'laboratorista', 'semillerista',
];

const ptzTokens = new Map(); // mid|host|usuario|clave -> { token, expiresAt } (si cambian los datos de la cámara, no se reusa el token)
const claveToken = (mid, cam) => `${mid}|${cam.host}|${cam.user}|${cam.pass}`;

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
  const cached = ptzTokens.get(claveToken(mid, cam));
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const resp = await reolinkPost(cam.host, '/cgi-bin/api.cgi?cmd=Login', [{
    cmd: 'Login',
    param: { User: { Version: '0', userName: cam.user, password: cam.pass } },
  }]);
  const token = resp?.[0]?.value?.Token?.name;
  if (!token) throw new Error(resp?.[0]?.error?.detail || 'login PTZ fallido');
  // leaseTime real reportado por la camara es 3600s -- cacheamos con margen
  // para renovar antes de que la camara lo expire del otro lado.
  ptzTokens.set(claveToken(mid, cam), { token, expiresAt: Date.now() + 30 * 60 * 1000 });
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
    ptzTokens.delete(claveToken(mid, cam));
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

// ── Rutas ──

/** GET /nvr/monitor/:groupKey */
async function listarMonitores(req, res, parts, verifyJwt) {
  const groupKey = decodeURIComponent(parts[2]);
  const claims = await exigirJwt(req, res, verifyJwt);
  if (!claims) return;
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
      console.log(`[camaras] sesion (re)usada para usuario=${username} groupKey=${groupKey}`);
      const rewritten = monitors.map((m) => ({
        ...m,
        ptz: Object.prototype.hasOwnProperty.call(ptzCams(), m.mid),
        webrtc: webrtc.rutaDe(m.mid),
        streams: (m.streams || []).map((s) => s.replace(`/${SHINOBI_API_KEY}/`, `/nvr/hls/${token}/`)),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rewritten));
    });
  }).on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'shinobi_unreachable', message: e.message }));
  });
}

/** GET /nvr/hls/:token/...resto... */
function servirHls(req, res, url, parts) {
  const token = parts[2];
  if (!isValidSession(token)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'invalid_or_expired_session' }));
  }
  const rest = parts.slice(3).join('/');
  proxyToShinobi(`/${SHINOBI_API_KEY}/${rest}${url.search}`, token, res);
}

/** POST /nvr/ptz/:groupKey/:mid */
async function controlarPtz(req, res, parts, verifyJwt) {
  const mid = decodeURIComponent(parts[3]);
  const claims = await exigirJwt(req, res, verifyJwt);
  if (!claims) return;

  // PTZ mueve hardware real -- a diferencia de /nvr/monitor (solo lectura),
  // aca si se exige rol, igual que el acceso a "Vigilancia" en el frontend
  // (usePermissions.PAGE_ACCESS['vigilancia']: todos los roles de personal).
  const roles = claims.realm_access?.roles || [];
  if (!PTZ_ROLES.some((r) => roles.includes(r))) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'forbidden', message: `PTZ requiere uno de estos roles: ${PTZ_ROLES.join(', ')}` }));
  }

  const cam = ptzCams()[mid];
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
      console.log(`[camaras] PTZ ${op} mid=${mid} usuario=${claims.preferred_username || claims.sub}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ptz_camera_error', message: e.message }));
    }
  });
}

/** Devuelve true si la petición era de cámaras (la haya respondido bien o mal). */
async function handle(req, res, url, parts, verifyJwt) {
  if (parts[0] !== 'nvr') return false;
  if (req.method === 'GET' && parts.length === 3 && parts[1] === 'monitor') { await listarMonitores(req, res, parts, verifyJwt); return true; }
  if (req.method === 'GET' && parts.length >= 4 && parts[1] === 'hls') { servirHls(req, res, url, parts); return true; }
  if (req.method === 'POST' && parts.length === 4 && parts[1] === 'ptz') { await controlarPtz(req, res, parts, verifyJwt); return true; }
  // POST /nvr/whep/:path — negociación WebRTC hacia MediaMTX (ver webrtc.js)
  return webrtc.handle(req, res, parts, verifyJwt);
}

module.exports = { handle, usarRegistro, SHINOBI_API_KEY };
