// webrtc.js — video de las cámaras por WebRTC (baja latencia, ~0,5 s).
//
// MediaMTX (misma Pi) ya recibe las cámaras por RTSP y habla WebRTC (WHEP).
// Este módulo solo deja pasar la negociación (oferta/respuesta SDP) si el
// token de Keycloak es válido: el video en sí NO pasa por aquí, viaja directo
// entre el cliente y MediaMTX por el puerto que anuncia (ver ICE-TCP en
// mediamtx.yml y la publicación de ese puerto en AWS).
//
//   POST /nvr/whep/:path   Authorization: Bearer <JWT>, Content-Type: application/sdp
//     Body: oferta SDP.  Respuesta: respuesta SDP de MediaMTX (201).
//
// Config (env): WEBRTC_PATHS_JSON, mapa mid de Shinobi -> path de MediaMTX,
//   ej. {"Camara1":"cam00","Camara03":"cam03"}. Solo esos paths se pueden
//   pedir: MediaMTX también sirve su API en otros puertos y no se expone nada
//   más que el WHEP de las cámaras listadas. MEDIAMTX_WEBRTC_PORT (8889).

const http = require('node:http');

const MEDIAMTX_PORT = Number(process.env.MEDIAMTX_WEBRTC_PORT) || 8889;
const MAX_SDP_BYTES = 32 * 1024;
const TIMEOUT_MS = 10_000;

let MAPA = {};
try {
  MAPA = JSON.parse(process.env.WEBRTC_PATHS_JSON || '{}');
} catch (e) {
  console.error('[webrtc] WEBRTC_PATHS_JSON invalido:', e.message);
}

// El registro de cámaras (registro.js) reemplaza al mapa de la variable de entorno cuando tiene cámaras: así una cámara
// nueva o editada desde la app aparece en WebRTC sin reiniciar. `fuente()` devuelve el mapa o null (= usar el de env).
let fuente = () => null;
function usarMapa(fn) { fuente = fn; }
function mapaActual() { return fuente() || MAPA; }
const pathsValidos = () => new Set(Object.values(mapaActual()));

/** Path de MediaMTX para un monitor de Shinobi, o null si no tiene WebRTC. */
function rutaDe(mid) {
  const m = mapaActual();
  return Object.prototype.hasOwnProperty.call(m, mid) ? m[mid] : null;
}

function responder(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_SDP_BYTES) { reject(new Error('sdp demasiado grande')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function whep(path, sdp) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: MEDIAMTX_PORT,
      path: `/${path}/whep`,
      method: 'POST',
      timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/sdp', 'Content-Length': Buffer.byteLength(sdp) },
    }, (up) => {
      let data = '';
      up.on('data', (c) => { data += c; });
      up.on('end', () => resolve({ status: up.statusCode, body: data }));
    });
    req.on('error', reject).on('timeout', () => req.destroy(new Error('timeout')));
    req.end(sdp);
  });
}

/**
 * Atiende POST /nvr/whep/:path. Devuelve false si la ruta no es de este módulo.
 * `verifyJwt` es el validador del broker (RS256 contra el JWKS de Keycloak).
 */
async function handle(req, res, parts, verifyJwt) {
  if (req.method !== 'POST' || parts[0] !== 'nvr' || parts[1] !== 'whep' || parts.length !== 3) return false;

  const auth = req.headers['authorization'] || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!jwt) { responder(res, 401, { error: 'missing_bearer_token' }); return true; }
  let claims;
  try {
    claims = await verifyJwt(jwt);
  } catch (e) {
    responder(res, 401, { error: 'invalid_jwt', message: e.message });
    return true;
  }

  // decodeURIComponent lanza URIError con un '%' mal formado: sin capturarlo, una ruta como
  // /nvr/whep/% tira el proceso entero del broker (excepción no manejada dentro del handler async).
  let path;
  try {
    path = decodeURIComponent(parts[2]);
  } catch {
    responder(res, 400, { error: 'invalid_path' });
    return true;
  }
  if (!pathsValidos().has(path)) { responder(res, 404, { error: 'webrtc_not_supported', path }); return true; }

  let sdp;
  try {
    sdp = await leerBody(req);
  } catch {
    responder(res, 400, { error: 'invalid_body' });
    return true;
  }
  if (!sdp.startsWith('v=0')) { responder(res, 400, { error: 'invalid_sdp' }); return true; }

  try {
    const up = await whep(path, sdp);
    console.log(`[webrtc] whep ${path} usuario=${claims.preferred_username || claims.sub} -> ${up.status}`);
    if (up.status !== 201 && up.status !== 200) {
      responder(res, up.status === 404 ? 404 : 502, { error: 'mediamtx_error', status: up.status, message: up.body.slice(0, 200) });
      return true;
    }
    // No se reenvía Location: el cliente cierra la conexión cerrando su
    // RTCPeerConnection y MediaMTX da la sesión por terminada.
    res.writeHead(201, { 'Content-Type': 'application/sdp' });
    res.end(up.body);
  } catch (e) {
    responder(res, 502, { error: 'mediamtx_unreachable', message: e.message });
  }
  return true;
}

module.exports = { handle, rutaDe, usarMapa };
