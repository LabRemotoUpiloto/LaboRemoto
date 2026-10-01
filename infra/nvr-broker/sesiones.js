// sesiones.js — registro central de sesiones de práctica.
//
// La app reporta inicio/latido/fin de cada práctica con el access_token de
// Keycloak, así el registro lleva al estudiante real aunque la práctica
// entre a la Pi con una cuenta compartida (EVE3 usa `pi`). Cada inicio y fin
// se reenvía al mismo flujo de Power Automate que usa RegistroExcel.sh; el
// Excel es el registro permanente y aquí solo queda una copia de los últimos
// RETENCION_DIAS para el dashboard de la app.
// La identidad sale SIEMPRE del token, nunca del body.
//
//   POST /nvr/sesiones/evento   (cualquier usuario autenticado)
//     {"tipo": "inicio"|"latido"|"fin"|"ubicacion", "sesion_id": "...",
//      "practica_id"?: "...", "practica_nombre"?: "...",
//      "lat"?, "lon"?, "precision_m"?}   (lat/lon/precision_m solo en "ubicacion")
//   GET  /nvr/sesiones/resumen?dias=N   (solo RESUMEN_ROLES)
//
// Ubicación: al iniciar se aproxima por IP (nivel ciudad; en red móvil suele
// dar el centro de la ciudad del operador). Si la app luego manda la
// ubicación del dispositivo (servicio de ubicación de Windows, redondeada en
// el cliente), esa la reemplaza y se traduce a barrio/ciudad con Nominatim.
//
// Persistencia: JSONL con el registro completo en cada cambio relevante; al
// cargar gana la última línea de cada sesión y el archivo se compacta; una
// vez al día se descarta lo más viejo que RETENCION_DIAS.
//
// Config (env): SESIONES_FILE, SESIONES_WEBHOOK_URL (Power Automate, opcional),
// IPINFO_TOKEN (opcional; sin token ipinfo.io permite 50k consultas/mes).

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const DATA_FILE = process.env.SESIONES_FILE || path.join(__dirname, 'sesiones.jsonl');
const WEBHOOK_URL = process.env.SESIONES_WEBHOOK_URL || '';
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || '';

// El cliente manda un latido cada 60 s; sin latido en 3 min la sesión se da
// por terminada (app cerrada a la fuerza, caída de red, etc.).
const LATIDO_VENCIDO_MS = 3 * 60_000;
const PERSISTIR_LATIDO_CADA_MS = 5 * 60_000;
// La copia local cubre justo lo que el dashboard puede pedir; el histórico
// completo vive en el Excel.
const MAX_DIAS_RESUMEN = 90;
const RETENCION_DIAS = MAX_DIAS_RESUMEN;
const MAX_BODY_BYTES = 8 * 1024;

// Debe coincidir con PAGE_ACCESS['dashboard'] en usePermissions.ts.
const RESUMEN_ROLES = ['admin_lab', 'jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista'];

const ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;

/** clave `${usuario}:${sesion_id}` -> registro */
const registros = new Map();
/** clave -> ms del último latido escrito a disco */
const ultimoLatidoPersistido = new Map();

// ── Persistencia ──

function cargar() {
  let contenido = '';
  try {
    contenido = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[sesiones] no se pudo leer', DATA_FILE, e.message);
    return;
  }
  for (const linea of contenido.split('\n')) {
    if (!linea.trim()) continue;
    try {
      const r = JSON.parse(linea);
      if (r && r.id) registros.set(r.id, r);
    } catch { /* línea truncada por un corte de luz: se descarta */ }
  }
  compactar();
  console.log(`[sesiones] ${registros.size} sesiones cargadas desde ${DATA_FILE}`);
}

/** Descarta las sesiones más viejas que RETENCION_DIAS y reescribe el archivo. */
function compactar() {
  const limite = Date.now() - RETENCION_DIAS * 86_400_000;
  for (const [id, r] of registros) {
    if (!(Date.parse(r.inicio) >= limite)) {
      registros.delete(id);
      ultimoLatidoPersistido.delete(id);
    }
  }
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, [...registros.values()].map((r) => JSON.stringify(r) + '\n').join(''));
  fs.renameSync(tmp, DATA_FILE);
}

setInterval(() => {
  try {
    compactar();
  } catch (e) {
    console.error('[sesiones] no se pudo compactar', DATA_FILE, e.message);
  }
}, 24 * 3_600_000).unref();

function persistir(r) {
  fs.appendFile(DATA_FILE, JSON.stringify(r) + '\n', (e) => {
    if (e) console.error('[sesiones] error escribiendo', e.message);
  });
}

// ── Utilidades ──

function horaLocal(iso) {
  // "YYYY-MM-DD HH:mm:ss" en hora de Colombia (sv-SE da ese formato).
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'America/Bogota' });
}

function ipCliente(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function esIpPrivada(ip) {
  return !ip
    || ip === '::1'
    || /^127\./.test(ip)
    || /^10\./.test(ip)
    || /^192\.168\./.test(ip)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    || /^f[cd]/i.test(ip);
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(url, {
      method: 'POST',
      timeout: 10_000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => (res.statusCode < 300 ? resolve() : reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))));
    });
    req.on('error', reject).on('timeout', () => req.destroy(new Error('timeout')));
    req.end(body);
  });
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 5000, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

// ── Geolocalización por IP (aprox. nivel ciudad) ──

const geoCache = new Map(); // ip -> {ciudad, region, pais, lat, lon}

async function geolocalizar(ip) {
  if (esIpPrivada(ip)) return null;
  if (geoCache.has(ip)) return geoCache.get(ip);
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json${IPINFO_TOKEN ? `?token=${IPINFO_TOKEN}` : ''}`;
  const d = await getJson(url);
  const [lat, lon] = typeof d.loc === 'string' ? d.loc.split(',').map(Number) : [null, null];
  const geo = { ciudad: d.city || null, region: d.region || null, pais: d.country || null, lat, lon };
  geoCache.set(ip, geo);
  return geo;
}

// ── Geocodificación inversa de la ubicación del dispositivo ──
// Nominatim (OpenStreetMap) exige User-Agent propio y máximo 1 consulta/s;
// con coordenadas redondeadas a ~100 m la caché absorbe casi todo.

const lugarCache = new Map(); // "lat,lon" -> {ciudad, region, pais}

async function lugarDeCoordenadas(lat, lon) {
  const clave = `${lat},${lon}`;
  if (lugarCache.has(clave)) return lugarCache.get(clave);
  const d = await getJson(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=es&lat=${lat}&lon=${lon}`,
    { 'User-Agent': 'LaboRemoto-UPiloto/1.0 (registro de sesiones de practica)' },
  );
  const a = d.address || {};
  const localidad = a.city || a.town || a.village || a.municipality || null;
  const barrio = a.suburb || a.neighbourhood || a.quarter || null;
  const lugar = {
    ciudad: [barrio, localidad].filter(Boolean).join(', ') || null,
    region: a.state || null,
    pais: a.country_code ? a.country_code.toUpperCase() : null,
  };
  lugarCache.set(clave, lugar);
  return lugar;
}

function coordenada(v, max) {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null;
}

// ── Webhook (Power Automate -> Excel/Teams) ──
// Mismo flujo y mismos campos que RegistroExcel.sh, más los datos que solo la
// app conoce (esquema en infra/registro-excel/README.md). Se manda al iniciar
// ("Activo") y al cerrar, con el mismo ID: el flujo crea la fila y luego la
// actualiza. Todo va como texto, "" si falta: un null o un número donde el
// esquema espera texto hace fallar el disparador (TriggerInputSchemaMismatch).

function texto(v) {
  return v === null || v === undefined ? '' : String(v);
}

function notificarWebhook(r) {
  if (!WEBHOOK_URL) return;
  const duracionMin = r.fin ? Math.round((Date.parse(r.fin) - Date.parse(r.inicio)) / 60_000) : null;
  postJson(WEBHOOK_URL, {
    ID: r.id,
    usuario: r.usuario,
    session_id: r.sesion_id,
    hora_conexion: horaLocal(r.inicio),
    hora_desconexion: r.fin ? horaLocal(r.fin) : 'Activo',
    ip: texto(r.ip),
    origen: 'app',
    nombre: texto(r.nombre),
    correo: texto(r.correo),
    practica: texto(r.practica_nombre || r.practica_id),
    duracion_min: texto(duracionMin),
    ciudad: texto(r.ciudad),
    region: texto(r.region),
    pais: texto(r.pais),
    lat: texto(r.lat),
    lon: texto(r.lon),
    fuente_ubicacion: texto(r.fuente_ubicacion),
    precision_m: texto(r.precision_m),
  }).catch((e) => console.error('[sesiones] webhook falló:', e.message));
}

// ── Cierre por falta de latido ──

setInterval(() => {
  const ahora = Date.now();
  for (const r of registros.values()) {
    if (!r.fin && ahora - Date.parse(r.ultimo_latido) > LATIDO_VENCIDO_MS) {
      r.fin = r.ultimo_latido;
      r.cierre = 'sin_latido';
      persistir(r);
      notificarWebhook(r);
    }
  }
}, 60_000).unref();

// ── Handlers ──

function responder(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_BODY_BYTES) { reject(new Error('body demasiado grande')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function textoOpcional(v, max) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

async function registrarEvento(req, res, claims) {
  let datos;
  try {
    datos = JSON.parse(await leerBody(req));
  } catch {
    return responder(res, 400, { error: 'invalid_body' });
  }
  const { tipo, sesion_id: sesionId } = datos || {};
  if (!['inicio', 'latido', 'fin', 'ubicacion'].includes(tipo)) return responder(res, 400, { error: 'invalid_tipo' });
  if (typeof sesionId !== 'string' || !ID_RE.test(sesionId)) return responder(res, 400, { error: 'invalid_sesion_id' });

  const usuario = claims.preferred_username || claims.sub;
  const id = `${usuario}:${sesionId}`;
  const ahora = new Date().toISOString();
  let r = registros.get(id);

  if (tipo === 'inicio') {
    if (r) {
      // Reintento del cliente: solo reabre si se había cerrado por timeout.
      if (r.cierre === 'sin_latido') { r.fin = null; r.cierre = null; }
      r.ultimo_latido = ahora;
      persistir(r);
      return responder(res, 200, { ok: true });
    }
    r = {
      id,
      sesion_id: sesionId,
      usuario,
      nombre: claims.name || null,
      correo: claims.email || null,
      practica_id: textoOpcional(datos.practica_id, 100),
      practica_nombre: textoOpcional(datos.practica_nombre, 200),
      inicio: ahora,
      ultimo_latido: ahora,
      fin: null,
      cierre: null,
      ip: ipCliente(req),
      ciudad: null, region: null, pais: null, lat: null, lon: null,
      /** "ip" (aprox. ciudad) | "dispositivo" (servicio de ubicación del equipo) */
      fuente_ubicacion: null,
      precision_m: null,
    };
    registros.set(id, r);
    persistir(r);
    responder(res, 201, { ok: true });
    console.log(`[sesiones] inicio usuario=${usuario} sesion=${sesionId} ip=${r.ip}`);

    try {
      const geo = await geolocalizar(r.ip);
      // La del dispositivo puede haber llegado mientras se consultaba la IP.
      if (geo && r.fuente_ubicacion !== 'dispositivo') {
        Object.assign(r, geo, { fuente_ubicacion: 'ip' });
        persistir(r);
      }
    } catch (e) {
      console.error(`[sesiones] geolocalización falló para ${r.ip}:`, e.message);
    }
    notificarWebhook(r);
    return;
  }

  if (!r) return responder(res, 404, { error: 'sesion_desconocida' });

  if (tipo === 'ubicacion') {
    const lat = coordenada(datos.lat, 90);
    const lon = coordenada(datos.lon, 180);
    const precision = coordenada(datos.precision_m, 1_000_000);
    if (lat === null || lon === null) return responder(res, 400, { error: 'invalid_coordenadas' });
    Object.assign(r, { lat, lon, precision_m: precision, fuente_ubicacion: 'dispositivo' });
    persistir(r);
    responder(res, 200, { ok: true });
    try {
      Object.assign(r, await lugarDeCoordenadas(lat, lon));
      persistir(r);
    } catch (e) {
      console.error(`[sesiones] geocodificación inversa falló para ${lat},${lon}:`, e.message);
    }
    return;
  }

  if (tipo === 'latido') {
    r.ultimo_latido = ahora;
    if (r.cierre === 'sin_latido') { r.fin = null; r.cierre = null; persistir(r); }
    else if (Date.now() - (ultimoLatidoPersistido.get(id) || 0) > PERSISTIR_LATIDO_CADA_MS) {
      ultimoLatidoPersistido.set(id, Date.now());
      persistir(r);
    }
    return responder(res, 200, { ok: true });
  }

  // tipo === 'fin'. Si ya se cerró por falta de latido, se conserva esa hora:
  // el tiempo sin latidos no cuenta como práctica.
  if (!r.fin) {
    r.ultimo_latido = ahora;
    r.fin = ahora;
    r.cierre = 'cliente';
    ultimoLatidoPersistido.delete(id);
    persistir(r);
    notificarWebhook(r);
  }
  return responder(res, 200, { ok: true });
}

function resumen(res, url, claims) {
  const roles = claims.realm_access?.roles || [];
  if (!RESUMEN_ROLES.some((rol) => roles.includes(rol))) {
    return responder(res, 403, { error: 'forbidden', message: `Requiere uno de estos roles: ${RESUMEN_ROLES.join(', ')}` });
  }
  const dias = Math.max(1, Math.min(MAX_DIAS_RESUMEN, Number(url.searchParams.get('dias')) || 30));
  const desde = Date.now() - dias * 86_400_000;
  const sesiones = [...registros.values()]
    .filter((r) => Date.parse(r.inicio) >= desde)
    .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
  return responder(res, 200, { generado: new Date().toISOString(), dias, sesiones });
}

/**
 * Atiende /nvr/sesiones/*. Devuelve false si la ruta no es de este módulo.
 * `verifyJwt` es el validador del broker (RS256 contra el JWKS de Keycloak).
 */
async function handle(req, res, url, parts, verifyJwt) {
  if (parts[0] !== 'nvr' || parts[1] !== 'sesiones' || parts.length !== 3) return false;
  const esEvento = req.method === 'POST' && parts[2] === 'evento';
  const esResumen = req.method === 'GET' && parts[2] === 'resumen';
  if (!esEvento && !esResumen) return false;

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

  try {
    if (esEvento) await registrarEvento(req, res, claims);
    else resumen(res, url, claims);
  } catch (e) {
    console.error('[sesiones] error:', e.message);
    if (!res.headersSent) responder(res, 500, { error: 'internal' });
  }
  return true;
}

cargar();

module.exports = { handle };
