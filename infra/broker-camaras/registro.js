// registro.js — registro único de cámaras: la fuente de verdad que antes estaba repartida en Shinobi, mediamtx.yml,
// PTZ_CAMERAS_JSON y WEBRTC_PATHS_JSON. Cada cámara:
//   { id, nombre, host, puerto, usuario, password, rtspPath, ptz, habilitada, ruta, creada, modificada }
// `id` es el `mid` del monitor de Shinobi y `ruta` el path de MediaMTX. La clave solo se guarda aquí (archivo 0600) y
// nunca se devuelve a los clientes (ver `vistaPublica`).

const fs = require('node:fs');
const path = require('node:path');

const RTSP_PATH_POR_DEFECTO = '/h264Preview_01_sub'; // substream de las Reolink
const MAX_RESPALDOS = 10;

/** IPv4 de red privada (RFC1918). Solo se aceptan estas: «probar conexión» no debe servir para escanear otras redes. */
function esIpPrivada(h) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
}

/**
 * Valida y normaliza los datos de una cámara. `parcial` (edición): solo valida los campos presentes.
 * Devuelve { errores: {campo: mensaje}, limpio }.
 */
function validar(d, { parcial = false } = {}) {
  const errores = {};
  const limpio = {};
  const tiene = (k) => d[k] !== undefined && d[k] !== null;
  const exigir = (k) => { if (!parcial && !tiene(k)) errores[k] = 'es obligatorio'; return tiene(k); };

  if (exigir('nombre')) {
    const v = String(d.nombre).trim();
    if (v.length < 1 || v.length > 40) errores.nombre = 'entre 1 y 40 caracteres';
    else if (/[<>"'`\\]/.test(v)) errores.nombre = 'no puede llevar < > " \' ` \\';
    else limpio.nombre = v;
  }
  if (exigir('host')) {
    const v = String(d.host).trim();
    if (!esIpPrivada(v)) errores.host = 'debe ser una IP de red privada (10.x, 172.16-31.x o 192.168.x)';
    else limpio.host = v;
  }
  if (tiene('puerto') || !parcial) {
    const v = tiene('puerto') ? Number(d.puerto) : 554;
    if (!Number.isInteger(v) || v < 1 || v > 65535) errores.puerto = 'puerto entre 1 y 65535';
    else limpio.puerto = v;
  }
  if (exigir('usuario')) {
    const v = String(d.usuario).trim();
    if (!/^[A-Za-z0-9._@-]{1,64}$/.test(v)) errores.usuario = 'letras, números y . _ @ - (máx. 64)';
    else limpio.usuario = v;
  }
  // En edición la clave es opcional (si no viene, se conserva la actual).
  if (tiene('password')) {
    const v = String(d.password);
    if (!/^[\x21-\x7E]{1,64}$/.test(v)) errores.password = 'entre 1 y 64 caracteres imprimibles, sin espacios';
    else limpio.password = v;
  } else if (!parcial) errores.password = 'es obligatoria';
  if (tiene('rtspPath') || !parcial) {
    const v = tiene('rtspPath') ? String(d.rtspPath).trim() : RTSP_PATH_POR_DEFECTO;
    if (!/^\/[A-Za-z0-9._~\/-]{1,120}$/.test(v)) errores.rtspPath = 'ruta RTSP como /h264Preview_01_sub';
    else limpio.rtspPath = v;
  }
  if (tiene('ptz')) limpio.ptz = Boolean(d.ptz);
  else if (!parcial) limpio.ptz = false;
  if (tiene('habilitada')) limpio.habilitada = Boolean(d.habilitada);
  else if (!parcial) limpio.habilitada = true;
  return { errores, limpio };
}

/** Lo que se le puede mostrar a un cliente: nunca la clave. */
function vistaPublica(c) {
  const { password, ...resto } = c;
  return { ...resto, tienePassword: Boolean(password) };
}

class Registro {
  constructor({ archivo, ahora = () => new Date() }) {
    this.archivo = archivo;
    this.ahora = ahora;
    this.camaras = [];
  }

  existe() { return fs.existsSync(this.archivo); }

  cargar() {
    if (!this.existe()) { this.camaras = []; return false; }
    const j = JSON.parse(fs.readFileSync(this.archivo, 'utf8'));
    this.camaras = Array.isArray(j.camaras) ? j.camaras : [];
    return true;
  }

  lista() { return this.camaras.map((c) => ({ ...c })); }
  obtener(id) { const c = this.camaras.find((x) => x.id === id); return c ? { ...c } : null; }

  /** Escritura atómica (archivo temporal + rename), con permisos 0600 y respaldo de la versión anterior. */
  guardar(camaras) {
    const dir = path.dirname(this.archivo);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(this.archivo)) {
      const sello = this.ahora().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      fs.copyFileSync(this.archivo, `${this.archivo}.bak-${sello}`);
      this._podarRespaldos();
    }
    const tmp = `${this.archivo}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, camaras }, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, this.archivo);
    this.camaras = camaras.map((c) => ({ ...c }));
  }

  _podarRespaldos() {
    const base = path.basename(this.archivo);
    const dir = path.dirname(this.archivo);
    const viejos = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.bak-`)).sort();
    for (const f of viejos.slice(0, Math.max(0, viejos.length - MAX_RESPALDOS))) fs.rmSync(path.join(dir, f), { force: true });
  }

  /** Siguiente id libre con el formato de los monitores de Shinobi: CamaraNN (NN = máximo numérico + 1). */
  siguienteId() {
    const n = this.camaras.map((c) => Number((/(\d+)$/.exec(c.id) || [])[1] || 0));
    return `Camara${String(Math.max(0, ...n) + 1).padStart(2, '0')}`;
  }

  /** Siguiente ruta libre de MediaMTX: camNN. */
  siguienteRuta() {
    const n = this.camaras.map((c) => Number((/(\d+)$/.exec(c.ruta) || [])[1] || 0));
    return `cam${String(Math.max(-1, ...n) + 1).padStart(2, '0')}`;
  }

  /** Mapas derivados que antes salían de variables de entorno. */
  mapaPtz() {
    return Object.fromEntries(this.camaras.filter((c) => c.ptz && c.habilitada).map((c) => [c.id, { host: c.host, user: c.usuario, pass: c.password }]));
  }
  mapaWebrtc() {
    return Object.fromEntries(this.camaras.filter((c) => c.habilitada).map((c) => [c.id, c.ruta]));
  }
}

/**
 * Primer arranque: arma el registro a partir de lo que ya existe (monitores de Shinobi, rutas de MediaMTX y los mapas
 * de las variables de entorno). Función pura: recibe los datos ya leídos.
 */
function importar({ monitores, mediamtx, ptz = {}, webrtc = {}, ahora = new Date() }) {
  const porHost = Object.fromEntries((mediamtx || []).map((m) => [m.host, m]));
  const iso = ahora.toISOString();
  return (monitores || []).map((m) => {
    const d = typeof m.details === 'string' ? JSON.parse(m.details) : (m.details || {});
    const mm = porHost[m.host] || {};
    const rtspPath = (/^rtsp:\/\/[^/]*(\/.*)$/.exec(d.auto_host || '') || [])[1] || mm.path || RTSP_PATH_POR_DEFECTO;
    return {
      id: m.mid, nombre: m.name || m.mid, host: m.host, puerto: Number(m.port) || 554,
      usuario: d.muser || mm.user || 'admin', password: d.mpass || mm.pass || '', rtspPath,
      ptz: Object.prototype.hasOwnProperty.call(ptz, m.mid), habilitada: m.mode !== 'stop',
      ruta: webrtc[m.mid] || mm.ruta || null, creada: iso, modificada: iso,
    };
  }).filter((c) => c.ruta);
}

module.exports = { Registro, validar, vistaPublica, importar, esIpPrivada, RTSP_PATH_POR_DEFECTO };
