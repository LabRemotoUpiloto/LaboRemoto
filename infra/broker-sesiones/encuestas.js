// encuestas.js — encuesta que el estudiante llena al terminar una práctica completa (todos sus módulos), para saber qué
// mejorar: preguntas generales de aprendizaje y de funcionamiento. Una respuesta por persona y práctica (si la vuelve a
// llenar, reemplaza la anterior).
//
//   POST /nvr/encuestas                      (JWT de Keycloak) {practica, respuestas: {…}}  → 201 nueva | 200 actualizada
//   GET  /nvr/encuestas/mia?practica=ID      (JWT) {respondida: bool} — para no volver a ofrecerla en otro equipo
//   GET  /nvr/encuestas/resumen?dias=N       (JWT con rol de supervisión) promedios, distribuciones y comentarios por práctica.
//                                            ANÓNIMO: el resumen nunca incluye quién respondió (se guarda solo para que cada
//                                            persona tenga una sola respuesta por práctica).
//
// Config (env): ENCUESTAS_FILE (JSONL; por defecto junto a este archivo).

const fs = require('node:fs');
const path = require('node:path');

const MAX_BODY = 8 * 1024;
const MAX_TEXTO = 1000;
const MAX_DIAS_RESUMEN = 365;
const MAX_COMENTARIOS = 200;
const RE_PRACTICA = /^[a-z0-9][a-z0-9._-]{0,63}$/;

// Preguntas. Si cambian, sube VERSION: el resumen solo mezcla respuestas de la misma versión de preguntas.
const VERSION = 1;
const ESCALAS = ['aprendizaje', 'claridad', 'funcionamiento', 'satisfaccion']; // 1 a 5
const DIFICULTAD = ['muy_facil', 'facil', 'adecuada', 'dificil', 'muy_dificil'];
const PROBLEMAS = ['ninguno', 'lentitud', 'desconexiones', 'terminal', 'camara', 'guia', 'otro'];
const TEXTOS = ['gusto', 'mejorar'];

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

const escala = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

/** Valida y limpia las respuestas. Devuelve {ok, limpio} o {ok:false, error}. */
function validarRespuestas(r) {
  if (!r || typeof r !== 'object') return { ok: false, error: 'respuestas_invalidas' };
  const limpio = {};
  for (const k of ESCALAS) {
    if (!escala(r[k])) return { ok: false, error: `${k}_invalido` };
    limpio[k] = r[k];
  }
  // asistente: 1 a 5, o «no lo usé»
  if (r.asistente === 'no_uso') limpio.asistente = 'no_uso';
  else if (escala(r.asistente)) limpio.asistente = r.asistente;
  else return { ok: false, error: 'asistente_invalido' };
  if (!DIFICULTAD.includes(r.dificultad)) return { ok: false, error: 'dificultad_invalida' };
  limpio.dificultad = r.dificultad;
  const problemas = Array.isArray(r.problemas) ? [...new Set(r.problemas)] : null;
  if (!problemas || !problemas.length || problemas.some((p) => !PROBLEMAS.includes(p))) return { ok: false, error: 'problemas_invalidos' };
  if (problemas.includes('ninguno') && problemas.length > 1) return { ok: false, error: 'problemas_invalidos' };
  limpio.problemas = problemas;
  for (const k of TEXTOS) {
    const v = r[k] == null ? '' : String(r[k]);
    limpio[k] = v.trim().slice(0, MAX_TEXTO);
  }
  return { ok: true, limpio };
}

const promedio = (v) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null);
const contar = (lista, opciones) => Object.fromEntries(opciones.map((o) => [o, lista.filter((x) => x === o).length]));

/**
 * @param {object} o
 * @param {string} o.archivo        JSONL de persistencia
 * @param {string[]} o.rolesResumen roles que pueden ver el resumen
 */
function crearEncuestas({ archivo, rolesResumen = [], ahora = Date.now }) {
  /** `${usuario}:${practica}` -> registro */
  const registros = new Map();

  function persistir(r) {
    if (!archivo) return;
    try { fs.appendFileSync(archivo, JSON.stringify(r) + '\n', { mode: 0o600 }); } catch (e) { console.error('[encuestas] error escribiendo:', e.message); }
  }

  function cargar() {
    if (!archivo || !fs.existsSync(archivo)) return;
    for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
      if (!linea.trim()) continue;
      try { const r = JSON.parse(linea); if (r && r.usuario && r.practica) registros.set(`${r.usuario}:${r.practica}`, r); } catch { /* línea dañada */ }
    }
    try { fs.writeFileSync(archivo, [...registros.values()].map((r) => JSON.stringify(r)).join('\n') + (registros.size ? '\n' : ''), { mode: 0o600 }); } catch (e) { console.error('[encuestas] no se pudo compactar:', e.message); }
  }

  function guardar(usuario, cuerpo) {
    const practica = String((cuerpo && cuerpo.practica) || '');
    if (!RE_PRACTICA.test(practica)) return [400, { error: 'practica_invalida' }];
    const v = validarRespuestas(cuerpo.respuestas);
    if (!v.ok) return [400, { error: v.error }];
    const clave = `${usuario}:${practica}`;
    const nueva = !registros.has(clave);
    const r = { usuario, practica, version: VERSION, fecha: new Date(ahora()).toISOString(), respuestas: v.limpio };
    registros.set(clave, r);
    persistir(r);
    console.log(`[encuestas] ${nueva ? 'nueva' : 'actualizada'} practica=${practica}`);
    return [nueva ? 201 : 200, { ok: true }];
  }

  function resumen(dias) {
    const n = Math.max(1, Math.min(MAX_DIAS_RESUMEN, Number(dias) || 90));
    const desde = ahora() - n * 86_400_000;
    const porPractica = new Map();
    for (const r of registros.values()) {
      if (r.version !== VERSION || Date.parse(r.fecha) < desde) continue;
      if (!porPractica.has(r.practica)) porPractica.set(r.practica, []);
      porPractica.get(r.practica).push(r);
    }
    const practicas = [...porPractica.entries()].map(([practica, lista]) => {
      const rs = lista.map((r) => r.respuestas);
      const promedios = Object.fromEntries(ESCALAS.map((k) => [k, promedio(rs.map((x) => x[k]))]));
      const asistenteNotas = rs.map((x) => x.asistente).filter((a) => a !== 'no_uso');
      // Comentarios sin autor, los más recientes primero.
      const comentarios = lista
        .filter((r) => r.respuestas.gusto || r.respuestas.mejorar)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, MAX_COMENTARIOS)
        .map((r) => ({ fecha: r.fecha, gusto: r.respuestas.gusto, mejorar: r.respuestas.mejorar }));
      return {
        practica,
        respuestas: lista.length,
        promedios: { ...promedios, asistente: promedio(asistenteNotas) },
        asistenteNoUso: rs.filter((x) => x.asistente === 'no_uso').length,
        dificultad: contar(rs.map((x) => x.dificultad), DIFICULTAD),
        problemas: contar(rs.flatMap((x) => x.problemas), PROBLEMAS),
        comentarios,
      };
    }).sort((a, b) => b.respuestas - a.respuestas);
    return { generado: new Date(ahora()).toISOString(), dias: n, version: VERSION, practicas };
  }

  async function handle(req, res, url, parts, verifyJwt) {
    if (parts[0] !== 'nvr' || parts[1] !== 'encuestas') return false;
    const esEnvio = req.method === 'POST' && parts.length === 2;
    const esMia = req.method === 'GET' && parts.length === 3 && parts[2] === 'mia';
    const esResumen = req.method === 'GET' && parts.length === 3 && parts[2] === 'resumen';
    if (!esEnvio && !esMia && !esResumen) return false;

    const auth = req.headers['authorization'] || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!jwt) { responder(res, 401, { error: 'missing_bearer_token' }); return true; }
    let claims;
    try { claims = await verifyJwt(jwt); } catch (e) { responder(res, 401, { error: 'invalid_jwt', message: e.message }); return true; }
    const usuario = claims.preferred_username || claims.sub;

    if (esEnvio) {
      let cuerpo;
      try { cuerpo = await leerJson(req); } catch (e) { responder(res, 400, { error: 'body_invalido', message: e.message }); return true; }
      const [status, json] = guardar(usuario, cuerpo);
      responder(res, status, json);
      return true;
    }
    if (esMia) {
      const practica = String(url.searchParams.get('practica') || '');
      if (!RE_PRACTICA.test(practica)) { responder(res, 400, { error: 'practica_invalida' }); return true; }
      responder(res, 200, { respondida: registros.has(`${usuario}:${practica}`) });
      return true;
    }
    const roles = (claims.realm_access && claims.realm_access.roles) || [];
    if (!rolesResumen.some((r) => roles.includes(r))) { responder(res, 403, { error: 'forbidden', message: `Requiere uno de estos roles: ${rolesResumen.join(', ')}` }); return true; }
    responder(res, 200, resumen(url.searchParams.get('dias')));
    return true;
  }

  cargar();
  return { handle, resumen };
}

function porDefecto() {
  const sesiones = require('./sesiones');
  return crearEncuestas({
    archivo: process.env.ENCUESTAS_FILE || path.join(__dirname, 'encuestas.jsonl'),
    rolesResumen: sesiones.RESUMEN_ROLES,
  });
}

module.exports = { crearEncuestas, validarRespuestas, porDefecto, VERSION, ESCALAS, DIFICULTAD, PROBLEMAS };
