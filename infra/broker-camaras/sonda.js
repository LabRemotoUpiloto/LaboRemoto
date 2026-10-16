// sonda.js — prueba una cámara ANTES de guardarla: ¿responde el video con esa clave? ¿acepta la API de Reolink? ¿tiene PTZ?
//
// Se ejecuta en la Pi4 (la que ve la red de las cámaras). Seguridad: el host ya viene validado como IP privada
// (registro.validar), ffprobe se invoca con argumentos (nunca por shell) y todo tiene tiempo límite.

const http = require('node:http');
const { execFile } = require('node:child_process');

const T_RTSP_MS = 12_000;
const T_API_MS = 5_000;

const enc = encodeURIComponent;

function urlRtsp({ host, puerto, usuario, password, rtspPath }) {
  return `rtsp://${enc(usuario)}:${enc(password)}@${host}:${puerto}${rtspPath}`;
}

/** ffprobe real: devuelve { codigo, stdout, stderr }. Inyectable en pruebas. */
function ffprobeReal(url) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-rtsp_transport', 'tcp', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', url],
      { timeout: T_RTSP_MS, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
        resolve({ codigo: err ? (err.killed ? 'timeout' : err.code || 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
  });
}

/** POST JSON a la API HTTP de una Reolink. Inyectable en pruebas. */
function reolinkReal(host, ruta, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({ host, port: 80, path: ruta, method: 'POST', timeout: T_API_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('respuesta no válida')); } });
    });
    req.on('error', reject).on('timeout', () => req.destroy(new Error('timeout')));
    req.end(body);
  });
}

/** Clasifica el fallo de ffprobe para decírselo al administrador en palabras. */
function motivoRtsp(r) {
  const t = r.stderr || '';
  if (r.codigo === 'timeout') return { codigo: 'timeout', mensaje: 'La cámara no respondió a tiempo (¿apagada o sin red?)' };
  if (/401 Unauthorized|authorization failed/i.test(t)) return { codigo: 'clave', mensaje: 'La cámara rechazó el usuario o la contraseña (401)' };
  if (/Connection refused/i.test(t)) return { codigo: 'rechazada', mensaje: 'Conexión rechazada: ¿RTSP desactivado o puerto equivocado?' };
  if (/No route to host|Network is unreachable/i.test(t)) return { codigo: 'sin_ruta', mensaje: 'No hay ruta hacia esa IP (apagada o fuera de la red)' };
  if (/404|Not Found/i.test(t)) return { codigo: 'ruta', mensaje: 'La cámara no tiene esa ruta de video (revisa la ruta RTSP)' };
  return { codigo: 'otro', mensaje: 'No se pudo abrir el video de la cámara' };
}

/**
 * @returns {{ ok: boolean, rtsp: object, api: object, ptz: boolean|null }}
 *   ok = el video abre con esa clave (lo único imprescindible). `ptz`: true/false si es Reolink, null si no se pudo saber.
 */
async function probar(c, { ffprobe = ffprobeReal, reolink = reolinkReal } = {}) {
  const out = { ok: false, rtsp: { ok: false }, api: { ok: false }, ptz: null };

  // El video y la API Reolink son independientes: se prueban a la vez para que «Probar conexión» no tarde la suma de las dos
  // (con el flujo de alta resolución, solo el video puede tardar más de 10 s).
  const [rtsp, api] = await Promise.all([probarVideo(c, ffprobe), probarApi(c, reolink)]);
  out.rtsp = rtsp.rtsp; out.ok = rtsp.ok;
  out.api = api.api; out.ptz = api.ptz;
  return out;
}

async function probarVideo(c, ffprobe) {
  const r = await ffprobe(urlRtsp(c));
  if (r.codigo === 0) {
    try {
      const v = (JSON.parse(r.stdout).streams || [])[0];
      if (v) return { ok: true, rtsp: { ok: true, video: { codec: v.codec_name, ancho: v.width || null, alto: v.height || null } } };
      return { ok: false, rtsp: { ok: false, codigo: 'sin_video', mensaje: 'La cámara respondió pero no entregó video' } };
    } catch { return { ok: false, rtsp: { ok: false, codigo: 'otro', mensaje: 'Respuesta de video no válida' } }; }
  }
  return { ok: false, rtsp: { ok: false, ...motivoRtsp(r) } };
}

// API Reolink (modelo y PTZ). Es informativa: no tener API no impide guardar una cámara que sí da video.
async function probarApi(c, reolink) {
  const out = { api: { ok: false }, ptz: null };
  try {
    const login = await reolink(c.host, '/cgi-bin/api.cgi?cmd=Login', [{ cmd: 'Login', param: { User: { userName: c.usuario, password: c.password } } }]);
    const token = login && login[0] && login[0].value && login[0].value.Token && login[0].value.Token.name;
    if (!token) return { api: { ok: false, mensaje: 'La API de la cámara no aceptó el usuario/clave' }, ptz: null };
    out.api = { ok: true };
    const [info, ptz] = await Promise.allSettled([
      reolink(c.host, `/cgi-bin/api.cgi?cmd=GetDevInfo&token=${enc(token)}`, [{ cmd: 'GetDevInfo', action: 0, param: {} }]),
      // «Stop» no mueve nada: solo comprueba que la cámara entiende comandos PTZ.
      reolink(c.host, `/cgi-bin/api.cgi?cmd=PtzCtrl&token=${enc(token)}`, [{ cmd: 'PtzCtrl', action: 0, param: { channel: 0, op: 'Stop' } }]),
    ]);
    if (info.status === 'fulfilled') out.api.modelo = ((((info.value || [])[0] || {}).value || {}).DevInfo || {}).model || null;
    out.ptz = ptz.status === 'fulfilled' ? Boolean(ptz.value && ptz.value[0] && ptz.value[0].code === 0) : false;
    return out;
  } catch { return { api: { ok: false, mensaje: 'La cámara no expone la API de Reolink (no es un problema si el video funciona)' }, ptz: null }; }
}

module.exports = { probar, urlRtsp, motivoRtsp };
