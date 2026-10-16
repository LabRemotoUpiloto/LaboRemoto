// admin.js — administración de cámaras (solo rol admin_lab): crear, editar, eliminar y probar.
//
//   GET    /nvr/camaras              lista (sin claves) con estado
//   POST   /nvr/camaras/probar       prueba una cámara SIN guardarla: video, clave, modelo y PTZ
//   POST   /nvr/camaras              crea (prueba antes; `forzar:true` guarda aunque la prueba falle)
//   PUT    /nvr/camaras/:id          edita (la clave es opcional: si no viene se conserva)
//   DELETE /nvr/camaras/:id          elimina
//
// Cada cambio se aplica en MediaMTX (en caliente), Shinobi y el registro, y si un paso falla se deshacen los anteriores.
// Las claves nunca salen en una respuesta ni en el registro de auditoría.

const fs = require('node:fs');
const path = require('node:path');
const { exigirJwt } = require('../broker-comun/auth');
const { validar, vistaPublica } = require('./registro');
const { sourceDe } = require('./mediamtx');

const ROL_ADMIN = 'admin_lab';
const MAX_BODY = 8 * 1024;
const CAMPOS_CONEXION = ['host', 'puerto', 'usuario', 'password', 'rtspPath'];
const MAX_PRUEBAS_POR_MIN = 12;

function responder(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function leerJson(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    let grande = false;
    req.on('data', (c) => { b += c; if (b.length > MAX_BODY) { grande = true; req.destroy(); } });
    req.on('end', () => {
      if (grande) return reject(new Error('cuerpo demasiado grande'));
      try { resolve(JSON.parse(b || '{}')); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

/** Auditoría en un archivo JSONL: quién, qué y sobre qué cámara. Nunca claves. */
function crearAuditoria(archivo) {
  return (evento) => {
    try {
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.appendFileSync(archivo, JSON.stringify({ cuando: new Date().toISOString(), ...evento }) + '\n', { mode: 0o600 });
    } catch (e) { console.error('[camaras] no se pudo escribir la auditoría:', e.message); }
  };
}

function crearAdmin({ registro, probar, mediamtx, shinobi, auditar = () => {}, ahora = () => new Date() }) {
  // Un solo cambio a la vez: evita que dos administradores se pisen y que el registro quede a medias.
  let cola = Promise.resolve();
  const serializar = (fn) => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };

  const pruebas = new Map(); // usuario -> marcas de tiempo (límite de pruebas por minuto)
  function limitarPruebas(usuario) {
    const t = ahora().getTime();
    const marcas = (pruebas.get(usuario) || []).filter((x) => t - x < 60_000);
    if (marcas.length >= MAX_PRUEBAS_POR_MIN) return false;
    marcas.push(t); pruebas.set(usuario, marcas);
    return true;
  }

  /** Ejecuta pasos con su "deshacer"; si uno falla, deshace los anteriores en orden inverso. */
  async function aplicar(pasos) {
    const hechos = [];
    for (const p of pasos) {
      try {
        const r = await p.hacer();
        hechos.push({ nombre: p.nombre, deshacer: p.deshacer ? () => p.deshacer(r) : null });
      } catch (e) {
        for (const h of hechos.reverse()) {
          if (h.deshacer) { try { await h.deshacer(); } catch (u) { console.error(`[camaras] no se pudo deshacer "${h.nombre}":`, u.message); } }
        }
        const err = new Error(e.message); err.paso = p.nombre; throw err;
      }
    }
  }

  function estadoDe(c, monitores, rutas) {
    const m = (monitores || []).find((x) => x.mid === c.id);
    let estado = 'connecting';
    if (!c.habilitada) estado = 'offline';
    else if (m && /^(watching|recording)$/i.test(m.status || '')) estado = 'active';
    return { estado, video: rutas && rutas[c.ruta] ? (rutas[c.ruta].listo ? 'transmitiendo' : 'sin video') : null };
  }

  async function listar() {
    const [mon, rut] = await Promise.allSettled([shinobi.listar(), mediamtx.estado()]);
    const monitores = mon.status === 'fulfilled' ? mon.value : null;
    const rutas = rut.status === 'fulfilled' ? rut.value : null;
    return registro.lista().map((c) => ({ ...vistaPublica(c), ...estadoDe(c, monitores, rutas) }));
  }

  function conflicto(c, ignorarId) {
    const otros = registro.lista().filter((x) => x.id !== ignorarId);
    if (otros.some((x) => x.host === c.host && x.puerto === c.puerto)) return { host: 'ya existe otra cámara con esa IP y puerto' };
    if (otros.some((x) => x.nombre.toLowerCase() === c.nombre.toLowerCase())) return { nombre: 'ya existe otra cámara con ese nombre' };
    return null;
  }

  async function guardarTodo(antes, despues, cam, usuario, accion, ruta) {
    // `antes`/`despues`: listas completas del registro. `cam`: la cámara afectada (null al eliminar).
    const plantilla = (await shinobi.listar())[0] || null;
    const previa = antes.find((c) => c.id === (cam ? cam.id : ruta.id));
    const ref = previa || cam; // lo que existía (o, si es nueva, la propia cámara) para saber qué ruta/monitor tocar
    await aplicar([
      cam && cam.habilitada
        ? { nombre: 'MediaMTX', hacer: () => mediamtx.aplicar(cam.ruta, sourceDe(cam)), deshacer: (ant) => mediamtx.restaurar(cam.ruta, ant) }
        : { nombre: 'MediaMTX', hacer: () => mediamtx.quitar(ref.ruta), deshacer: (ant) => (ant ? mediamtx.restaurar(ref.ruta, ant) : null) },
      cam
        ? { nombre: 'Shinobi', hacer: () => shinobi.guardar(cam, plantilla), deshacer: (ant) => shinobi.restaurar(cam.id, ant) }
        : { nombre: 'Shinobi', hacer: () => shinobi.eliminar(ref.id), deshacer: (ant) => (ant ? shinobi.restaurar(ref.id, ant) : null) },
      { nombre: 'registro', hacer: () => registro.guardar(despues), deshacer: () => registro.guardar(antes) },
      { nombre: 'mediamtx.yml', hacer: () => mediamtx.persistir(despues), deshacer: () => mediamtx.persistir(antes) },
    ]);
    auditar({ usuario, accion, id: ref.id, nombre: ref.nombre });
  }

  async function crear(body, usuario) {
    const { errores, limpio } = validar(body);
    if (Object.keys(errores).length) return [400, { error: 'datos_invalidos', errores }];
    const c = conflicto(limpio);
    if (c) return [409, { error: 'duplicada', errores: c }];

    let prueba = null;
    if (body.forzar !== true) {
      prueba = await probar(limpio);
      if (!prueba.ok) return [422, { error: 'prueba_fallida', prueba }];
    }
    const t = ahora().toISOString();
    const cam = { id: registro.siguienteId(), ...limpio, ptz: body.ptz === undefined && prueba ? Boolean(prueba.ptz) : limpio.ptz, ruta: registro.siguienteRuta(), creada: t, modificada: t };
    const antes = registro.lista();
    try { await guardarTodo(antes, [...antes, cam], cam, usuario, 'crear'); }
    catch (e) { return [502, { error: 'aplicar_fallo', paso: e.paso, message: e.message }]; }
    return [201, { camara: vistaPublica(cam), prueba }];
  }

  async function actualizar(id, body, usuario) {
    const actual = registro.obtener(id);
    if (!actual) return [404, { error: 'no_existe' }];
    const { errores, limpio } = validar(body, { parcial: true });
    if (Object.keys(errores).length) return [400, { error: 'datos_invalidos', errores }];
    const cam = { ...actual, ...limpio, modificada: ahora().toISOString() };
    const c = conflicto(cam, id);
    if (c) return [409, { error: 'duplicada', errores: c }];

    const cambiaConexion = CAMPOS_CONEXION.some((k) => limpio[k] !== undefined && limpio[k] !== actual[k]);
    let prueba = null;
    if (cambiaConexion && cam.habilitada && body.forzar !== true) {
      prueba = await probar(cam);
      if (!prueba.ok) return [422, { error: 'prueba_fallida', prueba }];
    }
    const antes = registro.lista();
    const despues = antes.map((x) => (x.id === id ? cam : x));
    try { await guardarTodo(antes, despues, cam, usuario, 'editar'); }
    catch (e) { return [502, { error: 'aplicar_fallo', paso: e.paso, message: e.message }]; }
    // Solo se registran los NOMBRES de los campos cambiados, nunca sus valores.
    auditar({ usuario, accion: 'editar_campos', id, campos: Object.keys(limpio).filter((k) => limpio[k] !== actual[k]) });
    return [200, { camara: vistaPublica(cam), prueba }];
  }

  async function eliminar(id, usuario) {
    const actual = registro.obtener(id);
    if (!actual) return [404, { error: 'no_existe' }];
    const antes = registro.lista();
    try { await guardarTodo(antes, antes.filter((x) => x.id !== id), null, usuario, 'eliminar', { id }); }
    catch (e) { return [502, { error: 'aplicar_fallo', paso: e.paso, message: e.message }]; }
    return [200, { ok: true }];
  }

  async function probarSinGuardar(body, usuario) {
    if (!limitarPruebas(usuario)) return [429, { error: 'demasiadas_pruebas', message: 'Espera un minuto' }];
    // Al probar una cámara existente sin escribir la clave, se usa la guardada (sin devolverla).
    const base = body.id ? registro.obtener(body.id) : null;
    const datos = { ...(base ? { host: base.host, puerto: base.puerto, usuario: base.usuario, password: base.password, rtspPath: base.rtspPath } : {}), ...body };
    delete datos.id;
    const { errores, limpio } = validar({ nombre: 'prueba', ...datos });
    if (Object.keys(errores).length) return [400, { error: 'datos_invalidos', errores }];
    return [200, { prueba: await probar(limpio) }];
  }

  async function handle(req, res, url, parts, verifyJwt) {
    if (parts[0] !== 'nvr' || parts[1] !== 'camaras') return false;
    const claims = await exigirJwt(req, res, verifyJwt);
    if (!claims) return true;
    const roles = (claims.realm_access && claims.realm_access.roles) || [];
    if (!roles.includes(ROL_ADMIN)) { responder(res, 403, { error: 'forbidden', message: `Requiere el rol ${ROL_ADMIN}` }); return true; }
    const usuario = claims.preferred_username || claims.sub;

    try {
      let r;
      if (parts.length === 2 && req.method === 'GET') r = [200, { camaras: await listar() }];
      else if (parts.length === 2 && req.method === 'POST') r = await serializar(async () => crear(await leerJson(req), usuario));
      else if (parts.length === 3 && parts[2] === 'probar' && req.method === 'POST') r = await probarSinGuardar(await leerJson(req), usuario);
      else if (parts.length === 3 && req.method === 'PUT') r = await serializar(async () => actualizar(decodeURIComponent(parts[2]), await leerJson(req), usuario));
      else if (parts.length === 3 && req.method === 'DELETE') r = await serializar(() => eliminar(decodeURIComponent(parts[2]), usuario));
      else r = [404, { error: 'not_found' }];
      responder(res, r[0], r[1]);
    } catch (e) {
      if (/JSON inválido|demasiado grande/.test(e.message)) responder(res, 400, { error: 'body_invalido', message: e.message });
      else { console.error('[camaras] error:', e.message); responder(res, 500, { error: 'internal_error' }); }
    }
    return true;
  }

  return { handle, listar };
}

module.exports = { crearAdmin, crearAuditoria };
