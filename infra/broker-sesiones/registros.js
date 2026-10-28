// registros.js — el registro de la terminal de cada intento de práctica de un estudiante, guardado en el servidor (antes
// solo quedaba en el equipo donde se hizo). Un intento es una práctica abierta en una pestaña de la app; la app lo manda al
// aprobarla, al cerrarla sin terminar y al cerrar la app, y entre medias deja una copia en el equipo por si se cuelga.
// Cada intento es UN archivo: un envío nuevo del mismo intento lo reemplaza (no se acumulan copias).
//
//   POST /nvr/registros                     (JWT) {id, practica, practicaNombre?, estado, inicio, fin, nota?, gzipBase64}
//                                           → 201 {archivo} nuevo | 200 {archivo} reemplazado
//   GET  /nvr/registros?dias=N              (JWT con rol de lectura) los intentos de los últimos N días (máx. 20)
//   GET  /nvr/registros/archivo?carpeta=C&id=I   (JWT con rol de lectura) el HTML de un intento
//
// Archivos: REGISTROS_DIR/<usuario>/<Nombre-Del-Estudiante>_<practica>_<AAAA-MM-DD_HH-MM-SS>.html, con la hora de inicio
// del intento en Bogotá (no cambia entre envíos, así el nombre es estable). Solo prácticas: las conexiones SSH a otros
// equipos no pasan por aquí. La persona sale del token, nunca del cuerpo: nadie puede escribir en la carpeta de otro.
// Se guardan RETENCION_DIAS días y luego se borran (revisión cada hora). El índice (registros.jsonl) tiene una línea por
// cambio y se compacta al arrancar y al borrar.
//
// Config (env): REGISTROS_DIR (por defecto, la carpeta `registros` junto a este archivo).

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// El nginx de AWS no deja pasar cuerpos de más de 1 MB (client_max_body_size por defecto; medido el 2026-10-28): la app
// recorta el principio de un registro más grande (cmd/registros.rs, MAX_GZIP_BASE64) para no pasarse.
const MAX_BODY = 1_048_576;
const MAX_HTML = 20 * 1024 * 1024;
const MAX_POR_PERSONA = 2000;
const RETENCION_DIAS = 20;
const REVISION_MS = 60 * 60_000;
const RE_PRACTICA = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const RE_ID = /^[A-Za-z0-9-]{8,64}$/;
const RE_CARPETA = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ESTADOS = ['terminada', 'sin_terminar', 'app_cerrada'];
/** Quién puede leer los registros. `docente` llega como rol o como `user_type` del token. Debe coincidir con
 *  REGISTROS_ESTUDIANTES en Cliente-Rust/frontend/src/features/cuenta/usePermissions.ts. */
const ROLES_LECTURA = ['admin_lab', 'semillerista', 'docente'];
const ZONA = 'America/Bogota';
const DIA = 86_400_000;

function responder(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function leerJson(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let largo = 0;
    let grande = false;
    // Pasado el tope se sigue leyendo sin guardar (en vez de cortar la conexión), para poder responder 413 y que la app sepa
    // que no sirve reintentar.
    req.on('data', (c) => {
      if (grande) return;
      largo += c.length;
      if (largo > MAX_BODY) { grande = true; trozos.length = 0; } else trozos.push(c);
    });
    req.on('end', () => {
      if (grande) return reject(Object.assign(new Error('cuerpo demasiado grande'), { status: 413 }));
      try { resolve(JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}')); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

/** Nombre de la carpeta de una persona: su usuario sin dominio, solo con caracteres seguros para una ruta. */
function carpetaDe(usuario) {
  const u = String(usuario || '').toLowerCase()
    .replace(/^upiloto\\/, '').replace(/@.*$/, '')
    .replace(/[^a-z0-9._-]/g, '_').replace(/^[._-]+/, '').slice(0, 64);
  return u || null;
}

/** «ANDRÉS felipe González» → «Andres-Felipe-Gonzalez»: sin tildes ni espacios, para el nombre del archivo. */
function nombreParaArchivo(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/).filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join('-').slice(0, 80);
}

const nombreDe = (claims) => claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ');

/** «2026-10-28_14-30-05» en la hora de Bogotá. */
function fechaParaArchivo(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
}

/**
 * Una hora que manda la app (un envío que se reintenta días después conserva la suya), salvo que no sea creíble (futura o
 * más vieja que lo que se guarda); entonces, `porDefecto`.
 */
function momentoDe(iso, ahora, porDefecto = ahora) {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= ahora + 5 * 60_000 && t >= ahora - RETENCION_DIAS * DIA ? t : porDefecto;
}

/** Puede leer los registros: admin_lab, semillerista o docente (rol del realm o `user_type`). */
function puedeLeer(claims) {
  const roles = ((claims.realm_access && claims.realm_access.roles) || []).map((r) => String(r).toLowerCase());
  if (claims.user_type) roles.push(String(claims.user_type).toLowerCase());
  return ROLES_LECTURA.some((r) => roles.includes(r));
}

/** El HTML del registro, descomprimido, o un error con su código HTTP. */
function leerHtml(gzipBase64) {
  if (typeof gzipBase64 !== 'string' || !gzipBase64) throw Object.assign(new Error('falta el registro'), { status: 400, codigo: 'registro_vacio' });
  let html;
  try {
    html = zlib.gunzipSync(Buffer.from(gzipBase64, 'base64'), { maxOutputLength: MAX_HTML }).toString('utf8');
  } catch (e) {
    const grande = e instanceof RangeError || e.code === 'ERR_BUFFER_TOO_LARGE';
    throw Object.assign(new Error(grande ? 'registro demasiado grande' : 'registro dañado'), { status: grande ? 413 : 400, codigo: grande ? 'registro_grande' : 'registro_invalido' });
  }
  if (!/^\s*<!doctype html>/i.test(html)) throw Object.assign(new Error('no es un registro de LaboRemoto'), { status: 400, codigo: 'registro_invalido' });
  return html;
}

/**
 * @param {object} o
 * @param {string} o.dir    carpeta raíz de los registros
 * @param {() => number} [o.ahora]
 * @param {boolean} [o.revisarSolo]  borrar lo vencido cada hora (las pruebas lo apagan y llaman a `borrarVencidos`)
 */
function crearRegistros({ dir, ahora = Date.now, revisarSolo = true }) {
  const indice = path.join(dir, 'registros.jsonl');
  /** `${carpeta}:${id}` -> registro del índice */
  const intentos = new Map();

  const rutaDe = (archivo) => path.join(dir, ...archivo.split('/'));
  const cuantos = (carpeta) => [...intentos.values()].filter((r) => r.carpeta === carpeta).length;

  function compactar() {
    const lineas = [...intentos.values()].map((r) => JSON.stringify(r));
    const tmp = `${indice}.tmp`;
    fs.writeFileSync(tmp, lineas.join('\n') + (lineas.length ? '\n' : ''), { mode: 0o640 });
    fs.renameSync(tmp, indice);
  }

  function cargar() {
    fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
    if (!fs.existsSync(indice)) return;
    for (const linea of fs.readFileSync(indice, 'utf8').split('\n')) {
      if (!linea.trim()) continue;
      try {
        const r = JSON.parse(linea);
        if (r && r.carpeta && r.id && r.archivo) intentos.set(`${r.carpeta}:${r.id}`, r); // la última línea manda
      } catch { /* línea dañada */ }
    }
    try { compactar(); } catch (e) { console.error('[registros] no se pudo compactar el índice:', e.message); }
  }

  /** Escribe el archivo sin dejarlo a medias: primero a un temporal y luego se renombra encima. */
  function escribirEncima(archivo, html) {
    const ruta = rutaDe(archivo);
    const tmp = `${ruta}.tmp`;
    fs.writeFileSync(tmp, html, { mode: 0o640 });
    fs.renameSync(tmp, ruta);
  }

  /** Nombre libre para un intento nuevo: si ya hay uno igual (dos intentos en el mismo segundo), «_2», «_3»… */
  function nombreLibre(carpeta, base) {
    const destino = path.join(dir, carpeta);
    fs.mkdirSync(destino, { recursive: true, mode: 0o750 });
    for (let n = 1; n < 100; n++) {
      const nombre = `${base}${n > 1 ? `_${n}` : ''}.html`;
      // defensa extra: el archivo tiene que quedar dentro de la carpeta de la persona
      if (path.dirname(path.join(destino, nombre)) !== destino) throw new Error('ruta fuera de la carpeta');
      if (!fs.existsSync(path.join(destino, nombre))) return `${carpeta}/${nombre}`; // siempre con «/», también en Windows
    }
    throw new Error('demasiados registros con el mismo nombre');
  }

  function guardar(claims, cuerpo) {
    const carpeta = carpetaDe(claims.preferred_username || claims.sub);
    if (!carpeta) return [400, { error: 'usuario_invalido' }];
    const id = String(cuerpo.id || '');
    if (!RE_ID.test(id)) return [400, { error: 'id_invalido' }];
    const practica = String(cuerpo.practica || '');
    if (!RE_PRACTICA.test(practica)) return [400, { error: 'practica_invalida' }];
    if (!ESTADOS.includes(cuerpo.estado)) return [400, { error: 'estado_invalido' }];

    const clave = `${carpeta}:${id}`;
    const antes = intentos.get(clave);
    if (antes && antes.practica !== practica) return [409, { error: 'intento_de_otra_practica' }];
    if (!antes && cuantos(carpeta) >= MAX_POR_PERSONA) return [507, { error: 'sin_espacio_para_la_persona' }];

    let html;
    try { html = leerHtml(cuerpo.gzipBase64); } catch (e) { return [e.status, { error: e.codigo, message: e.message }]; }

    const t = ahora();
    const fin = momentoDe(cuerpo.fin, t);
    const inicio = antes ? Date.parse(antes.inicio) : Math.min(momentoDe(cuerpo.inicio, t, fin), fin);
    const archivo = antes ? antes.archivo
      : nombreLibre(carpeta, `${nombreParaArchivo(nombreDe(claims)) || carpeta}_${practica}_${fechaParaArchivo(inicio)}`);
    escribirEncima(archivo, html);

    const nota = Number.isFinite(cuerpo.nota) && cuerpo.nota >= 0 && cuerpo.nota <= 100 ? cuerpo.nota : null;
    const r = {
      id, carpeta, usuario: claims.preferred_username || claims.sub, nombre: nombreDe(claims) || null, practica,
      practicaNombre: typeof cuerpo.practicaNombre === 'string' ? cuerpo.practicaNombre.trim().slice(0, 120) || null : (antes && antes.practicaNombre) || null,
      // aprobada una vez, queda aprobada: cerrar la pestaña después no la vuelve «sin terminar»
      estado: antes && antes.estado === 'terminada' ? 'terminada' : cuerpo.estado,
      nota: nota ?? (antes ? antes.nota : null),
      inicio: new Date(inicio).toISOString(), fin: new Date(fin).toISOString(), recibido: new Date(t).toISOString(),
      archivo, bytes: Buffer.byteLength(html),
    };
    intentos.set(clave, r);
    try { fs.appendFileSync(indice, JSON.stringify(r) + '\n', { mode: 0o640 }); } catch (e) { console.error('[registros] no se pudo escribir el índice:', e.message); }
    console.log(`[registros] ${antes ? 'reemplazado' : 'nuevo'} carpeta=${carpeta} practica=${practica} estado=${r.estado} bytes=${r.bytes}`);
    return [antes ? 200 : 201, { ok: true, archivo }];
  }

  /** Lo que ve quien revisa: sin rutas del servidor, solo lo necesario para listar y pedir el archivo. */
  function lista(dias) {
    const n = Math.max(1, Math.min(RETENCION_DIAS, Number(dias) || RETENCION_DIAS));
    const desde = ahora() - n * DIA;
    const registros = [...intentos.values()]
      .filter((r) => Date.parse(r.fin) >= desde)
      .sort((a, b) => Date.parse(b.fin) - Date.parse(a.fin))
      .map(({ id, carpeta, usuario, nombre, practica, practicaNombre, estado, nota, inicio, fin, bytes, archivo }) =>
        ({ id, carpeta, usuario, nombre, practica, practicaNombre, estado, nota, inicio, fin, bytes, archivo: archivo.split('/').pop() }));
    return { generado: new Date(ahora()).toISOString(), dias: n, retencionDias: RETENCION_DIAS, registros };
  }

  /** Borra los intentos que terminaron hace más de RETENCION_DIAS días (archivo, entrada del índice y carpeta vacía). */
  function borrarVencidos() {
    const limite = ahora() - RETENCION_DIAS * DIA;
    let borrados = 0;
    for (const [clave, r] of intentos) {
      if (Date.parse(r.fin) >= limite) continue;
      try { fs.rmSync(rutaDe(r.archivo), { force: true }); } catch (e) { console.error('[registros] no se pudo borrar:', e.message); continue; }
      intentos.delete(clave);
      borrados++;
      try { fs.rmdirSync(path.join(dir, r.carpeta)); } catch { /* todavía tiene archivos */ }
    }
    if (borrados) {
      try { compactar(); } catch (e) { console.error('[registros] no se pudo compactar el índice:', e.message); }
      console.log(`[registros] borrados ${borrados} de hace más de ${RETENCION_DIAS} días`);
    }
    return borrados;
  }

  async function handle(req, res, url, parts, verifyJwt) {
    if (parts[0] !== 'nvr' || parts[1] !== 'registros') return false;
    const esEnvio = req.method === 'POST' && parts.length === 2;
    const esLista = req.method === 'GET' && parts.length === 2;
    const esArchivo = req.method === 'GET' && parts.length === 3 && parts[2] === 'archivo';
    if (!esEnvio && !esLista && !esArchivo) return false;

    const auth = req.headers['authorization'] || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!jwt) { responder(res, 401, { error: 'missing_bearer_token' }); return true; }
    let claims;
    try { claims = await verifyJwt(jwt); } catch (e) { responder(res, 401, { error: 'invalid_jwt', message: e.message }); return true; }

    if (esEnvio) {
      let cuerpo;
      try { cuerpo = await leerJson(req); } catch (e) { responder(res, e.status || 400, { error: 'body_invalido', message: e.message }); return true; }
      let status, json;
      try {
        [status, json] = guardar(claims, cuerpo && typeof cuerpo === 'object' ? cuerpo : {});
      } catch (e) {
        console.error('[registros] no se pudo guardar:', e.message);
        [status, json] = [500, { error: 'no_se_pudo_guardar' }];
      }
      responder(res, status, json);
      return true;
    }

    if (!puedeLeer(claims)) { responder(res, 403, { error: 'forbidden', message: `Requiere uno de estos roles: ${ROLES_LECTURA.join(', ')}` }); return true; }
    if (esLista) { responder(res, 200, lista(url.searchParams.get('dias'))); return true; }

    const carpeta = String(url.searchParams.get('carpeta') || '');
    const id = String(url.searchParams.get('id') || '');
    // La ruta nunca sale de lo que manda el cliente: se busca en el índice y se usa la que quedó guardada.
    const r = RE_CARPETA.test(carpeta) && RE_ID.test(id) ? intentos.get(`${carpeta}:${id}`) : null;
    if (!r) { responder(res, 404, { error: 'no_encontrado' }); return true; }
    let html;
    try { html = fs.readFileSync(rutaDe(r.archivo)); } catch { responder(res, 404, { error: 'no_encontrado' }); return true; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return true;
  }

  cargar();
  borrarVencidos();
  if (revisarSolo) setInterval(borrarVencidos, REVISION_MS).unref();
  return { handle, lista, borrarVencidos };
}

function porDefecto() {
  return crearRegistros({ dir: process.env.REGISTROS_DIR || path.join(__dirname, 'registros') });
}

module.exports = {
  crearRegistros, porDefecto, carpetaDe, nombreParaArchivo, fechaParaArchivo, momentoDe, puedeLeer, MAX_BODY, RETENCION_DIAS, ROLES_LECTURA,
};
