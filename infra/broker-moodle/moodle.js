// moodle.js — cursos y prácticas desde Moodle, sin que el cliente toque el token de Moodle.
//
// El broker guarda el token del servicio web de Moodle y valida el JWT de Keycloak. El cliente solo manda su
// access_token; la identidad sale de `preferred_username` (debe coincidir con el username de Moodle) y cada
// consulta se limita a lo que esa persona puede ver (el usuario de servicio ve TODO, así que la autorización
// se aplica aquí).
//
//   GET  /nvr/moodle/cursos                 cursos de la persona y su rol en cada uno (docente | estudiante)
//   GET  /nvr/moodle/cursos/:id/practicas   tareas del curso cuyo "ID number" empieza por `labo:` (= prácticas)
//   POST /nvr/moodle/resultado              {cmid, nota 0-100, resumen}: deja la nota provisional y el comentario
//                                            en estado «listo para revisar»; el docente decide en Moodle.
//
// Convención: la práctica `ev3-m3` se vincula a una tarea de Moodle con ID number `labo:ev3-m3`. La tarea debe
// tener activado el flujo de calificación; si no, el resultado quedaría como nota final y NO se envía.
//
// Config (env): MOODLE_URL (ej. http://172.16.34.52:8080), MOODLE_TOKEN, MOODLE_HOST_HEADER (el wwwroot de Moodle,
// ej. localhost:8080: Moodle redirige si el Host no coincide).

const http = require('node:http');
const zlib = require('node:zlib');

const PREFIJO = 'labo:';
const ROLES_DOCENTE = new Set(['editingteacher', 'teacher']);
const MAX_BODY = 8 * 1024;
// El resultado puede traer el registro de la sesión (HTML comprimido con gzip y en base64).
const MAX_BODY_RESULTADO = 1_500_000;
const MAX_REGISTRO_BYTES = 6 * 1024 * 1024;
const MAX_RESUMEN = 1500;
const TTL_USUARIO_MS = 5 * 60_000;
const TIMEOUT_MS = 10_000;
// Estados desde los que un estudiante puede (re)enviar su resultado. Una vez que el docente lo revisa
// (inreview, readyforrelease, released) o la nota ya es final (graded), no se pisa.
const ESTADOS_REENVIABLES = new Set(['notgraded', 'notmarked', 'readyforreview']);

class MoodleError extends Error {
  constructor(message, codigo) { super(message); this.codigo = codigo; }
}

/** Aplana params al estilo PHP de Moodle: {a:[{b:1}]} -> [['a[0][b]','1']]. */
function aplanar(obj, prefijo = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefijo ? `${prefijo}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (x !== null && typeof x === 'object') aplanar(x, `${key}[${i}]`, out);
        else out.push([`${key}[${i}]`, String(x)]);
      });
    } else if (v !== null && typeof v === 'object') {
      aplanar(v, key, out);
    } else if (v !== undefined && v !== null) {
      out.push([key, String(v)]);
    }
  }
  return out;
}

function llamadaReal(config) {
  const base = new URL(config.url);
  return function llamar(funcion, params = {}) {
    const cuerpo = new URLSearchParams([
      ['wstoken', config.token], ['wsfunction', funcion], ['moodlewsrestformat', 'json'], ...aplanar(params),
    ]).toString();
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: base.hostname, port: base.port || 80, path: '/webservice/rest/server.php', method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(cuerpo),
          ...(config.hostHeader ? { Host: config.hostHeader } : {}),
        },
        timeout: TIMEOUT_MS,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { return reject(new MoodleError(`respuesta no JSON (HTTP ${res.statusCode})`, 'bad_response')); }
          if (json && json.exception) return reject(new MoodleError(json.message || json.exception, json.errorcode));
          resolve(json);
        });
      });
      req.on('timeout', () => req.destroy(new MoodleError('timeout hablando con Moodle', 'timeout')));
      req.on('error', (e) => reject(e instanceof MoodleError ? e : new MoodleError(e.message, 'network')));
      req.end(cuerpo);
    });
  };
}

/** Sube un archivo al área borrador del usuario de servicio (webservice/upload.php) y devuelve el itemid. */
function subidaReal(config) {
  const base = new URL(config.url);
  return function subir(nombre, contenido) {
    const limite = `----labo${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const campos = (k, v) => Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    const cuerpo = Buffer.concat([
      campos('token', config.token), campos('filearea', 'draft'), campos('itemid', '0'),
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="file_1"; filename="${nombre}"\r\nContent-Type: application/zip\r\n\r\n`),
      contenido, Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: base.hostname, port: base.port || 80, path: '/webservice/upload.php', method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${limite}`, 'Content-Length': cuerpo.length,
          ...(config.hostHeader ? { Host: config.hostHeader } : {}),
        },
        timeout: 30_000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { return reject(new MoodleError(`subida: respuesta no JSON (HTTP ${res.statusCode})`, 'bad_upload')); }
          if (json && json.error) return reject(new MoodleError(json.error, json.errorcode || 'upload_error'));
          const itemid = Array.isArray(json) && json[0] && Number(json[0].itemid);
          if (!itemid) return reject(new MoodleError('subida: Moodle no devolvió el itemid', 'bad_upload'));
          resolve(itemid);
        });
      });
      req.on('timeout', () => req.destroy(new MoodleError('timeout subiendo el registro a Moodle', 'timeout')));
      req.on('error', (e) => reject(e instanceof MoodleError ? e : new MoodleError(e.message, 'network')));
      req.end(cuerpo);
    });
  };
}

// ── Registro de la sesión: se entrega en un .zip y con una política que impide ejecutar código ──
// Moodle muestra los .html subidos dentro de su propio sitio, sin aislarlos: un HTML hecho a mano por un estudiante podría
// atacar al docente que lo abra. Un .zip solo se descarga (no se ejecuta en Moodle) y, además, el HTML lleva una política de
// contenido que bloquea scripts, formularios y recursos externos si se abre en el equipo del docente.
const POLITICA_HTML = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; font-src data:; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">';

function conPolitica(html) {
  const texto = html.toString('utf8');
  const doctype = /^\s*<!doctype[^>]*>/i.exec(texto);
  return Buffer.from(doctype ? texto.slice(0, doctype[0].length) + POLITICA_HTML + texto.slice(doctype[0].length) : POLITICA_HTML + texto, 'utf8');
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP mínimo con un solo archivo (deflate). */
function crearZip(nombre, contenido, fecha = new Date()) {
  const nom = Buffer.from(nombre, 'utf8');
  const datos = zlib.deflateRawSync(contenido);
  const crc = crc32(contenido);
  const hora = ((fecha.getUTCHours() << 11) | (fecha.getUTCMinutes() << 5) | (fecha.getUTCSeconds() >> 1)) & 0xffff;
  const dia = ((Math.max(0, fecha.getUTCFullYear() - 1980) << 9) | ((fecha.getUTCMonth() + 1) << 5) | fecha.getUTCDate()) & 0xffff;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(hora, 10); local.writeUInt16LE(dia, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(datos.length, 18); local.writeUInt32LE(contenido.length, 22); local.writeUInt16LE(nom.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10); central.writeUInt16LE(hora, 12); central.writeUInt16LE(dia, 14); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(datos.length, 20); central.writeUInt32LE(contenido.length, 24); central.writeUInt16LE(nom.length, 28);
  const inicioCentral = local.length + nom.length + datos.length;
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(central.length + nom.length, 12); fin.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, nom, datos, central, nom, fin]);
}

/** Registro de la sesión: HTML en gzip+base64 -> Buffer. Devuelve null si no viene o no es válido. */
function leerRegistro(log) {
  if (!log || typeof log.gzipBase64 !== 'string' || !log.gzipBase64) return null;
  try {
    const html = zlib.gunzipSync(Buffer.from(log.gzipBase64, 'base64'), { maxOutputLength: MAX_REGISTRO_BYTES });
    return html.length ? html : null;
  } catch { return null; }
}

// ── Enlace desde Moodle a la app ──
// Moodle no deja poner enlaces con un esquema propio (laboremoto://) en la descripción de una tarea, pero sí http(s). Esta página
// pública hace de puente: el docente pega en la tarea `http://<servidor>/nvr/moodle/abrir/<práctica>` y al abrirla se lanza la app.
const ID_PRACTICA = /^[A-Za-z0-9._-]{1,100}$/;
const URL_DESCARGA = 'https://github.com/LabRemotoUpiloto/LaboRemoto/releases/latest';

function paginaAbrir(id) {
  const destino = `laboremoto://practica/${id}`; // el id ya está validado: solo letras, números, punto, guion y guion bajo
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Abrir en LaboRemoto</title>
<style>body{font-family:system-ui,sans-serif;background:#12100e;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{max-width:460px;padding:32px;text-align:center}a.b{display:inline-block;margin:18px 0;padding:12px 28px;border-radius:10px;background:#e21f19;color:#fff;font-weight:700;text-decoration:none}
small{color:#9ca3af;display:block;line-height:1.5}small a{color:#f7cd3d}</style></head>
<body><main><h1>Abriendo LaboRemoto…</h1>
<p>Práctica <strong>${id}</strong></p>
<a class="b" href="${destino}">Abrir en LaboRemoto</a>
<small>Si el navegador pregunta si quieres abrir la aplicación, acéptalo.<br>¿No pasa nada? Instala la aplicación desde <a href="${URL_DESCARGA}">aquí</a> y vuelve a pulsar el botón.</small></main>
<script>setTimeout(function(){location.href=${JSON.stringify(destino)}},400)</script></body></html>`;
}

function responderHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  });
  res.end(html);
}

function escaparHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function responder(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function leerJson(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let body = '';
    let demasiado = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > max) { demasiado = true; req.destroy(); }
    });
    req.on('end', () => {
      if (demasiado) return reject(new Error('cuerpo demasiado grande'));
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

/**
 * Crea el manejador. `llamar(funcion, params)` y `ahora()` se inyectan para pruebas.
 */
function crearModulo({ llamar, subir = null, configurado = true, ahora = Date.now }) {
  const usuarios = new Map(); // username -> {id, hasta}

  async function usuarioMoodle(username) {
    const clave = String(username).toLowerCase();
    const hit = usuarios.get(clave);
    if (hit && hit.hasta > ahora()) return hit.id;
    const lista = await llamar('core_user_get_users_by_field', { field: 'username', values: [clave] });
    const id = Array.isArray(lista) && lista[0] ? lista[0].id : null;
    if (id !== null) usuarios.set(clave, { id, hasta: ahora() + TTL_USUARIO_MS });
    return id;
  }

  /** Cursos del usuario con su rol (docente si tiene rol de profesor en ese curso). */
  async function cursosDe(userid) {
    const cursos = await llamar('core_enrol_get_users_courses', { userid });
    if (!Array.isArray(cursos) || cursos.length === 0) return [];
    // Un perfil por curso: la respuesta no trae el id del curso, así que no se mezclan pares en una sola llamada.
    const perfiles = await Promise.all(cursos.map((c) =>
      llamar('core_user_get_course_user_profiles', { userlist: [{ userid, courseid: c.id }] })));
    return cursos.map((c, i) => {
      const perfil = Array.isArray(perfiles[i]) ? perfiles[i][0] : null;
      const roles = perfil ? (perfil.roles || []).map((r) => r.shortname) : [];
      return {
        id: c.id, nombre: c.fullname, corto: c.shortname,
        rol: roles.some((r) => ROLES_DOCENTE.has(r)) ? 'docente' : 'estudiante',
        visible: c.visible !== 0,
      };
    });
  }

  async function practicasDeCurso(cursoId, userid, esDocente) {
    const [contenido, tareas] = await Promise.all([
      llamar('core_course_get_contents', { courseid: cursoId }),
      llamar('mod_assign_get_assignments', { courseids: [cursoId], includenotenrolledcourses: 1 }),
    ]);
    const porCmid = new Map();
    for (const c of (tareas && tareas.courses) || []) for (const a of c.assignments || []) porCmid.set(a.cmid, a);

    const modulos = [];
    for (const sec of Array.isArray(contenido) ? contenido : []) {
      for (const m of sec.modules || []) {
        if (m.modname === 'assign' && (esDocente || m.visible !== 0)) modulos.push(m);
      }
    }
    const detalles = await Promise.all(modulos.map((m) => llamar('core_course_get_course_module', { cmid: m.id })));
    const practicas = [];
    for (let i = 0; i < modulos.length; i++) {
      const cm = detalles[i] && detalles[i].cm;
      const idnumber = cm && cm.idnumber ? String(cm.idnumber) : '';
      if (!idnumber.startsWith(PREFIJO)) continue;
      const tarea = porCmid.get(modulos[i].id) || {};
      const p = {
        cmid: modulos[i].id, tareaId: modulos[i].instance, nombre: modulos[i].name,
        practica: idnumber.slice(PREFIJO.length),
        flujoRevision: tarea.markingworkflow === 1 || tarea.markingworkflow === true,
        notaMaxima: tarea.grade ?? null,
      };
      if (!esDocente) {
        const st = await llamar('mod_assign_get_submission_status', { assignid: modulos[i].instance, userid });
        p.estado = (st && st.lastattempt && st.lastattempt.gradingstatus) || 'notgraded';
      }
      practicas.push(p);
    }
    return practicas;
  }

  async function handle(req, res, url, parts, verifyJwt) {
    if (parts[0] !== 'nvr' || parts[1] !== 'moodle') return false;

    // Página puente Moodle -> app: pública a propósito (la abre el navegador desde un enlace en Moodle) y sin datos de nadie.
    if (req.method === 'GET' && parts.length === 4 && parts[2] === 'abrir') {
      if (!ID_PRACTICA.test(parts[3])) { responder(res, 404, { error: 'practica_invalida' }); return true; }
      responderHtml(res, paginaAbrir(parts[3]));
      return true;
    }

    const auth = req.headers['authorization'] || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!jwt) { responder(res, 401, { error: 'missing_bearer_token' }); return true; }
    let claims;
    try { claims = await verifyJwt(jwt); } catch (e) { responder(res, 401, { error: 'invalid_jwt', message: e.message }); return true; }
    if (!configurado) { responder(res, 503, { error: 'moodle_no_configurado' }); return true; }
    const username = claims.preferred_username;
    if (!username) { responder(res, 401, { error: 'sin_username' }); return true; }

    try {
      // GET /nvr/moodle/cursos
      if (req.method === 'GET' && parts.length === 3 && parts[2] === 'cursos') {
        const uid = await usuarioMoodle(username);
        if (uid === null) { responder(res, 200, { enMoodle: false, cursos: [] }); return true; }
        const cursos = (await cursosDe(uid)).filter((c) => c.rol === 'docente' || c.visible);
        responder(res, 200, { enMoodle: true, cursos: cursos.map(({ visible, ...c }) => c) });
        return true;
      }

      // GET /nvr/moodle/cursos/:id/practicas
      if (req.method === 'GET' && parts.length === 5 && parts[2] === 'cursos' && parts[4] === 'practicas') {
        const cursoId = Number(parts[3]);
        if (!Number.isInteger(cursoId) || cursoId <= 0) { responder(res, 400, { error: 'curso_invalido' }); return true; }
        const uid = await usuarioMoodle(username);
        const curso = uid === null ? null : (await cursosDe(uid)).find((c) => c.id === cursoId);
        if (!curso) { responder(res, 403, { error: 'no_matriculado' }); return true; }
        const practicas = await practicasDeCurso(cursoId, uid, curso.rol === 'docente');
        responder(res, 200, { curso: { id: curso.id, nombre: curso.nombre, corto: curso.corto, rol: curso.rol }, practicas });
        return true;
      }

      // POST /nvr/moodle/resultado
      if (req.method === 'POST' && parts.length === 3 && parts[2] === 'resultado') {
        let body;
        try { body = await leerJson(req, MAX_BODY_RESULTADO); } catch (e) { responder(res, 400, { error: 'body_invalido', message: e.message }); return true; }
        const cmid = Number(body.cmid);
        const nota = Number(body.nota);
        if (!Number.isInteger(cmid) || cmid <= 0) { responder(res, 400, { error: 'cmid_invalido' }); return true; }
        if (!Number.isFinite(nota) || nota < 0 || nota > 100) { responder(res, 400, { error: 'nota_invalida', message: 'nota entre 0 y 100' }); return true; }
        const resumen = typeof body.resumen === 'string' ? body.resumen.slice(0, MAX_RESUMEN) : '';

        const uid = await usuarioMoodle(username);
        if (uid === null) { responder(res, 403, { error: 'no_matriculado' }); return true; }
        const info = await llamar('core_course_get_course_module', { cmid });
        const cm = info && info.cm;
        if (!cm || cm.modname !== 'assign' || !String(cm.idnumber || '').startsWith(PREFIJO) || cm.visible === 0) {
          responder(res, 404, { error: 'practica_no_encontrada' }); return true;
        }
        const curso = (await cursosDe(uid)).find((c) => c.id === cm.course);
        if (!curso || curso.rol !== 'estudiante') { responder(res, 403, { error: 'no_matriculado_como_estudiante' }); return true; }

        const tareas = await llamar('mod_assign_get_assignments', { courseids: [cm.course], includenotenrolledcourses: 1 });
        const tarea = ((tareas && tareas.courses) || []).flatMap((c) => c.assignments || []).find((a) => a.cmid === cmid);
        if (!tarea) { responder(res, 404, { error: 'practica_no_encontrada' }); return true; }
        if (!(tarea.markingworkflow === 1 || tarea.markingworkflow === true)) {
          responder(res, 409, { error: 'tarea_sin_flujo_de_revision', message: 'La tarea debe tener activado el flujo de calificación' });
          return true;
        }
        const st = await llamar('mod_assign_get_submission_status', { assignid: tarea.id, userid: uid });
        const estado = (st && st.lastattempt && st.lastattempt.gradingstatus) || 'notgraded';
        if (!ESTADOS_REENVIABLES.has(estado)) { responder(res, 409, { error: 'ya_en_revision_o_calificada', estado }); return true; }

        const notaTarea = Math.round((nota * (Number(tarea.grade) || 100)) / 100 * 100) / 100;
        const comentario = `Resultado enviado por LaboRemoto (${escaparHtml(cm.idnumber)}): ${escaparHtml(resumen) || 'sin detalle'}`;
        // El registro completo de la sesión va como archivo de comentarios. Si no se puede subir, la nota se envía igual.
        const plugindata = { assignfeedbackcomments_editor: { text: `<p>${comentario}</p>`, format: 1 } };
        let registro = body.log ? 'no_valido' : 'no_enviado';
        const html = leerRegistro(body.log);
        if (html && subir) {
          try {
            const base = `registro-${String(cm.idnumber).slice(PREFIJO.length).replace(/[^A-Za-z0-9._-]/g, '_')}-${new Date(ahora()).toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
            plugindata.files_filemanager = await subir(`${base}.zip`, crearZip(`${base}.html`, conPolitica(html), new Date(ahora())));
            registro = 'adjuntado';
          } catch (e) {
            console.error('[moodle] no se pudo subir el registro:', e.codigo || e.message);
            registro = 'fallo_la_subida';
          }
        } else if (html) {
          registro = 'subida_no_disponible';
        }
        await llamar('mod_assign_save_grade', {
          assignmentid: tarea.id, userid: uid, grade: notaTarea, attemptnumber: -1, addattempt: 0,
          workflowstate: 'readyforreview', applytoall: 0, plugindata,
        });
        console.log(`[moodle] resultado cmid=${cmid} usuario=${username} nota=${notaTarea} registro=${registro}`);
        responder(res, 200, { ok: true, estado: 'readyforreview', registro });
        return true;
      }
    } catch (e) {
      console.error('[moodle] error:', e.message);
      responder(res, 502, { error: 'moodle_error', message: e.codigo || 'error' });
      return true;
    }

    responder(res, 404, { error: 'not_found' });
    return true;
  }

  return { handle };
}

const config = {
  url: process.env.MOODLE_URL || '',
  token: process.env.MOODLE_TOKEN || '',
  hostHeader: process.env.MOODLE_HOST_HEADER || '',
};
const predeterminado = crearModulo({
  llamar: config.url && config.token ? llamadaReal(config) : async () => { throw new MoodleError('no configurado', 'config'); },
  subir: config.url && config.token ? subidaReal(config) : null,
  configurado: Boolean(config.url && config.token),
});

module.exports = { handle: predeterminado.handle, crearModulo, llamadaReal, subidaReal, aplanar, crearZip, conPolitica, paginaAbrir, MoodleError };
