// gateway.js — puerta de entrada de los brokers: reparte /nvr/… al servicio que corresponde.
//
// Existe para que las URLs públicas NO cambien al separar los servicios: el túnel inverso y el nginx de AWS siguen
// apuntando a un solo puerto (8091) y las apps ya instaladas siguen llamando a /nvr/…. No valida tokens ni guarda
// secretos: cada servicio valida el JWT por su cuenta. Si un servicio se cae, solo falla su ruta (503), los demás
// siguen respondiendo.
//
//   /nvr/monitor, /nvr/hls, /nvr/ptz, /nvr/whep, /nvr/camaras  -> broker-camaras   (UPSTREAM_CAMARAS,  http://127.0.0.1:8092)
//   /nvr/sesiones, /nvr/dispositivos/resumen     -> broker-sesiones  (UPSTREAM_SESIONES, http://127.0.0.1:8093)
//   /nvr/moodle                                  -> broker-moodle    (UPSTREAM_MOODLE,   http://127.0.0.1:8094)

const http = require('node:http');

const TIMEOUT_MS = 30_000;
const RUTAS_CAMARAS = new Set(['monitor', 'hls', 'ptz', 'whep', 'camaras']);

function upstreamsDesdeEnv(env = process.env) {
  return {
    camaras: env.UPSTREAM_CAMARAS || 'http://127.0.0.1:8092',
    sesiones: env.UPSTREAM_SESIONES || 'http://127.0.0.1:8093',
    moodle: env.UPSTREAM_MOODLE || 'http://127.0.0.1:8094',
  };
}

/** Nombre del servicio que atiende estas partes de ruta, o null. */
function servicioDe(parts) {
  if (parts[0] !== 'nvr' || parts.length < 2) return null;
  if (RUTAS_CAMARAS.has(parts[1])) return 'camaras';
  if (parts[1] === 'sesiones') return 'sesiones';
  // Dispositivos: solo la consulta (con JWT). La ruta de eventos es del agente y es solo local: no se publica.
  if (parts[1] === 'dispositivos') return parts.length === 3 && parts[2] === 'resumen' ? 'sesiones' : null;
  if (parts[1] === 'moodle') return 'moodle';
  return null;
}

function error(res, status, servicio, codigo) {
  if (res.headersSent) { res.end(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: codigo, servicio }));
}

function proxear(req, res, servicio, destino) {
  return new Promise((resolve) => {
    const base = new URL(destino);
    const headers = { ...req.headers, host: base.host };
    delete headers.connection;
    const up = http.request({
      hostname: base.hostname, port: base.port || 80, method: req.method, path: req.url, headers, timeout: TIMEOUT_MS,
    }, (upRes) => {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
      upRes.on('end', resolve);
      upRes.on('error', () => { res.destroy(); resolve(); });
    });
    up.on('timeout', () => up.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    up.on('error', (e) => {
      console.error(`[gateway] ${servicio} no responde: ${e.code || e.message}`);
      error(res, e.code === 'ETIMEDOUT' ? 504 : 503, servicio, 'servicio_no_disponible');
      resolve();
    });
    // Si el cliente corta (cierra la app, deja de ver el video), no seguimos pidiendo al servicio.
    res.on('close', () => { if (!res.writableEnded) up.destroy(); });
    req.pipe(up);
  });
}

/** `manejar` para crearServidor: true si la ruta es de algún servicio. */
function crearManejador(upstreams = upstreamsDesdeEnv()) {
  return async function manejar(req, res, url, parts) {
    const servicio = servicioDe(parts);
    if (!servicio) return false;
    await proxear(req, res, servicio, upstreams[servicio]);
    return true;
  };
}

module.exports = { crearManejador, servicioDe, upstreamsDesdeEnv };
