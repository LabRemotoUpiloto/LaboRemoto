// dispositivos.js — quién entra por SSH a cada dispositivo (Pi), con su ubicación. Aparte de las prácticas.
//
// Los datos los manda un agente que corre EN el dispositivo (infra/agente-conexiones) y solo cuenta las conexiones nuevas, desde
// que arranca: no hay historial anterior.
//
//   POST /nvr/dispositivos/evento    del agente, con el token del dispositivo (cabecera X-Dispositivo-Token). Solo local:
//                                    la puerta de entrada NO la publica (broker-gateway/gateway.js).
//        {dispositivo, tipo: "entrada"|"salida"|"latido", hora?, sesion?, usuario?, ip?, abiertas?: [sesion…]}
//   GET  /nvr/dispositivos/resumen?dias=N   (JWT de Keycloak con rol de supervisión): por dispositivo, quién está conectado
//        ahora y las conexiones recientes (usuario, entrada, salida, IP y ubicación).
//
// Usuarios: los del LDAP (UPILOTO\persona, o persona@upiloto.edu / @upc.edu.co) se unifican en `UPILOTO\persona`. La cuenta
// compartida `pi` (prácticas EV3) no identifica a nadie: solo se cuenta. Las cuentas no reconocidas (root, etc.) se guardan
// aparte, para poder avisar de ellas. La técnica `svc-practicas` se ignora.
//
// Config (env): DISPOSITIVOS_JSON = {"pi4": {"nombre": "Pi4", "token": "…"}}, DISPOSITIVOS_FILE (JSONL; por defecto junto a este
// archivo). La ubicación por IP es la misma de sesiones.js (ipinfo.io, nivel ciudad).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RETENCION_DIAS = 90;
const MAX_DIAS_RESUMEN = 90;
const LATIDO_VENCIDO_MS = 90_000;     // sin latido en este tiempo, el dispositivo se muestra «sin conexión»
const GRACIA_CIERRE_MS = 30_000;      // una sesión recién abierta no se cierra por no aparecer aún en el latido
const MAX_BODY = 8 * 1024;
const MAX_CONEXIONES = 300;           // por dispositivo en el resumen
const DOMINIOS_CORREO = ['upiloto.edu', 'upc.edu.co'];

const RE_LDAP_PREFIJO = /^upiloto\\*(.+)$/i;
const RE_SESION = /^\d{1,10}$/;
const RE_IP = /^[0-9a-fA-F:.]{2,45}$/;

/** { tipo: 'ldap'|'compartida'|'ignorar'|'otro', persona } — mismas reglas que el flujo del Excel, pero unificando variantes. */
function normalizarUsuario(crudo) {
  const u = String(crudo || '').trim();
  if (!u || u === 'svc-practicas') return { tipo: 'ignorar', persona: null };
  const m = RE_LDAP_PREFIJO.exec(u);                    // UPILOTO\x, UPILOTO\\x, Upiloto\\\\x y UPILOTOx (barras perdidas)
  if (m) {
    const persona = m[1].replace(/^\\+|\\+$/g, '').split('@')[0].toLowerCase();
    return persona ? { tipo: 'ldap', persona } : { tipo: 'otro', persona: null };
  }
  if (u.includes('@')) {
    const i = u.lastIndexOf('@');
    const local = u.slice(0, i); const dominio = u.slice(i + 1).toLowerCase();
    return local && DOMINIOS_CORREO.includes(dominio) ? { tipo: 'ldap', persona: local.toLowerCase() } : { tipo: 'otro', persona: null };
  }
  if (u === 'pi') return { tipo: 'compartida', persona: 'pi' };
  return { tipo: 'otro', persona: null };
}

const mostrarUsuario = (persona) => `UPILOTO\\${persona}`;

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

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const tokenValido = (esperado, recibido) => Boolean(esperado) && crypto.timingSafeEqual(hash(esperado), hash(recibido || ''));

/**
 * @param {object} o
 * @param {object} o.dispositivos      { id: { nombre, token } }
 * @param {string} o.archivo           JSONL de persistencia
 * @param {(ip) => Promise<object|null>} o.geolocalizar
 * @param {(persona) => string|null} o.nombrePorPersona
 * @param {string[]} o.rolesResumen
 */
function crearDispositivos({ dispositivos, archivo, geolocalizar = async () => null, nombrePorPersona = () => null, rolesResumen = [], esIpPrivada = () => false, ubicacionDeLaApp = () => null, ahora = Date.now }) {
  /** id -> registro de conexión */
  const registros = new Map();
  /** `${dispositivo}:${sesion}` -> registro abierto */
  const abiertas = new Map();
  /** dispositivo -> ms del último latido */
  const latidos = new Map();

  // ── Persistencia: una línea por cambio; al cargar gana la última de cada id ──
  // Síncrono a propósito: son pocas líneas, y con escrituras asíncronas el orden no está garantizado (una «salida» podría quedar
  // escrita antes que su «entrada» y, tras un reinicio, una sesión cerrada aparecería abierta).
  function persistir(r) {
    if (!archivo) return;
    try { fs.appendFileSync(archivo, JSON.stringify(r) + '\n', { mode: 0o600 }); } catch (e) { console.error('[dispositivos] error escribiendo:', e.message); }
  }

  function cargar() {
    if (!archivo || !fs.existsSync(archivo)) return;
    const limite = ahora() - RETENCION_DIAS * 86_400_000;
    for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
      if (!linea.trim()) continue;
      try { const r = JSON.parse(linea); if (r && r.id) registros.set(r.id, r); } catch { /* línea dañada */ }
    }
    for (const [id, r] of registros) if (Date.parse(r.inicio) < limite) registros.delete(id);
    for (const r of registros.values()) if (!r.fin) abiertas.set(`${r.dispositivo}:${r.sesion}`, r);
    // Compacta: una línea por conexión.
    try { fs.writeFileSync(archivo, [...registros.values()].map((r) => JSON.stringify(r)).join('\n') + (registros.size ? '\n' : ''), { mode: 0o600 }); } catch (e) { console.error('[dispositivos] no se pudo compactar:', e.message); }
  }

  // Hora del evento: la del agente si es razonable (±10 min), si no la del servidor.
  function horaDe(ev) {
    const t = Date.parse(ev.hora);
    return Number.isFinite(t) && Math.abs(t - ahora()) < 600_000 ? t : ahora();
  }

  function cerrar(r, cuando, cierre) {
    r.fin = new Date(cuando).toISOString();
    r.cierre = cierre;
    abiertas.delete(`${r.dispositivo}:${r.sesion}`);
    persistir(r);
  }

  /** Aplica un evento ya autenticado. Devuelve [status, cuerpo]. */
  function aplicarEvento(ev) {
    const t = horaDe(ev);
    if (ev.tipo === 'latido') {
      latidos.set(ev.dispositivo, ahora());
      const lista = Array.isArray(ev.abiertas) ? new Set(ev.abiertas.map(String)) : null;
      if (lista) {
        for (const r of [...abiertas.values()]) {
          if (r.dispositivo === ev.dispositivo && !lista.has(r.sesion) && ahora() - Date.parse(r.inicio) > GRACIA_CIERRE_MS) cerrar(r, t, 'sin_cierre');
        }
      }
      return [200, { ok: true }];
    }
    if (!RE_SESION.test(String(ev.sesion || ''))) return [400, { error: 'sesion_invalida' }];
    const sesion = String(ev.sesion);
    const clave = `${ev.dispositivo}:${sesion}`;

    if (ev.tipo === 'salida') {
      const r = abiertas.get(clave);
      if (r) { cerrar(r, t, 'cliente'); console.log(`[dispositivos] salida ${ev.dispositivo} sesion=${sesion}`); }
      return [200, { ok: true }];
    }

    // entrada
    const usuario = String(ev.usuario || '').slice(0, 100);
    const ip = String(ev.ip || '');
    if (!usuario) return [400, { error: 'usuario_invalido' }];
    if (!RE_IP.test(ip)) return [400, { error: 'ip_invalida' }];
    const { tipo, persona } = normalizarUsuario(usuario);
    if (tipo === 'ignorar') return [200, { ok: true, ignorado: true }];
    if (abiertas.has(clave)) return [200, { ok: true, duplicado: true }];
    const r = {
      id: `${ev.dispositivo}:${sesion}:${t}`, dispositivo: ev.dispositivo, sesion, tipo, persona,
      usuario: tipo === 'otro' ? usuario : (persona ? mostrarUsuario(persona) : usuario),
      ip, inicio: new Date(t).toISOString(), fin: null, cierre: null,
      ciudad: null, region: null, pais: null, lat: null, lon: null,
    };
    registros.set(r.id, r);
    abiertas.set(clave, r);
    persistir(r);
    console.log(`[dispositivos] entrada ${ev.dispositivo} sesion=${sesion} tipo=${tipo}${persona ? ` persona=${persona}` : ''}`);
    // Ubicación aproximada por IP (nivel ciudad), como en las prácticas; no bloquea la respuesta.
    Promise.resolve().then(() => geolocalizar(ip)).then((geo) => {
      if (geo && r.fuente !== 'app') { Object.assign(r, geo); persistir(r); }
    }).catch((e) => console.error('[dispositivos] geolocalización falló:', e.message));
    return [201, { ok: true }];
  }

  function publico(r) {
    return {
      id: r.id, usuario: r.tipo === 'compartida' ? 'pi (cuenta compartida)' : r.usuario, persona: r.tipo === 'ldap' ? r.persona : null,
      nombre: r.tipo === 'ldap' ? nombrePorPersona(r.persona) : null,
      inicio: r.inicio, fin: r.fin, activa: !r.fin, cierre: r.cierre, ip: r.ip,
      ciudad: r.ciudad, region: r.region, pais: r.pais, lat: r.lat, lon: r.lon,
    };
  }

  /**
 * Si la misma IP tiene una práctica con la ubicación exacta del equipo (cerca en el tiempo), esa reemplaza la aproximación por IP.
 * Se revisa al consultar el resumen, así vale tanto si la práctica empezó antes como si empezó después de la conexión SSH.
 */
  function mejorarUbicacion(r) {
    if (r.fuente === 'app' && r.ciudad) return;
    const u = ubicacionDeLaApp(r.ip, Date.parse(r.inicio));
    if (!u) return;
    Object.assign(r, { ciudad: u.ciudad, region: u.region, pais: u.pais, lat: u.lat, lon: u.lon, precision_m: u.precision_m, fuente: 'app' });
    persistir(r);
  }

  function resumen(dias) {
    const n = Math.max(1, Math.min(MAX_DIAS_RESUMEN, Number(dias) || 30));
    const desde = ahora() - n * 86_400_000;
    const todos = [...registros.values()].filter((r) => Date.parse(r.inicio) >= desde || !r.fin);
    for (const r of todos) if (r.tipo !== 'otro') mejorarUbicacion(r);
    const lista = Object.entries(dispositivos).map(([id, d]) => {
      const mios = todos.filter((r) => r.dispositivo === id);
      // La cuenta compartida no identifica a nadie, pero una entrada desde fuera de la red del laboratorio es una persona (las
      // automáticas, como el puente del EV3, vienen de IP privadas y solo se cuentan).
      const ldap = mios.filter((r) => r.tipo === 'ldap' || (r.tipo === 'compartida' && !esIpPrivada(r.ip))).sort((a, b) => b.inicio.localeCompare(a.inicio));
      const compartida = mios.filter((r) => r.tipo === 'compartida');
      const otras = mios.filter((r) => r.tipo === 'otro').sort((a, b) => b.inicio.localeCompare(a.inicio));
      const ult = latidos.get(id) || null;
      return {
        id, nombre: d.nombre || id,
        enLinea: ult !== null && ahora() - ult < LATIDO_VENCIDO_MS,
        ultimoLatido: ult ? new Date(ult).toISOString() : null,
        conectados: ldap.filter((r) => !r.fin).map(publico),
        conexiones: ldap.slice(0, MAX_CONEXIONES).map(publico),
        totalConexiones: ldap.length,
        personasDistintas: new Set(ldap.filter((r) => r.tipo === 'ldap').map((r) => r.persona)).size,
        cuentaCompartida: { nombre: 'pi', conexiones: compartida.length, activas: compartida.filter((r) => !r.fin).length },
        noReconocidas: { conexiones: otras.length, activas: otras.filter((r) => !r.fin).length, ultimas: otras.slice(0, 20).map((r) => ({ usuario: r.usuario, ip: r.ip, inicio: r.inicio, activa: !r.fin, ciudad: r.ciudad, pais: r.pais })) },
      };
    });
    return { generado: new Date(ahora()).toISOString(), dias: n, dispositivos: lista };
  }

  async function handle(req, res, url, parts, verifyJwt) {
    if (parts[0] !== 'nvr' || parts[1] !== 'dispositivos' || parts.length !== 3) return false;

    if (req.method === 'POST' && parts[2] === 'evento') {
      let ev;
      try { ev = await leerJson(req); } catch (e) { responder(res, 400, { error: 'body_invalido', message: e.message }); return true; }
      const d = dispositivos[ev && ev.dispositivo];
      if (!d || !tokenValido(d.token, req.headers['x-dispositivo-token'])) { responder(res, 403, { error: 'forbidden' }); return true; }
      if (!['entrada', 'salida', 'latido'].includes(ev.tipo)) { responder(res, 400, { error: 'tipo_invalido' }); return true; }
      const [status, cuerpo] = aplicarEvento(ev);
      responder(res, status, cuerpo);
      return true;
    }

    if (req.method === 'GET' && parts[2] === 'resumen') {
      const auth = req.headers['authorization'] || '';
      const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (!jwt) { responder(res, 401, { error: 'missing_bearer_token' }); return true; }
      let claims;
      try { claims = await verifyJwt(jwt); } catch (e) { responder(res, 401, { error: 'invalid_jwt', message: e.message }); return true; }
      const roles = (claims.realm_access && claims.realm_access.roles) || [];
      if (!rolesResumen.some((r) => roles.includes(r))) { responder(res, 403, { error: 'forbidden', message: `Requiere uno de estos roles: ${rolesResumen.join(', ')}` }); return true; }
      responder(res, 200, resumen(url.searchParams.get('dias')));
      return true;
    }
    return false;
  }

  cargar();
  // Una vez al día se descarta lo más viejo que la retención.
  const limpieza = setInterval(() => {
    const limite = ahora() - RETENCION_DIAS * 86_400_000;
    for (const [id, r] of registros) if (r.fin && Date.parse(r.inicio) < limite) registros.delete(id);
  }, 86_400_000);
  if (limpieza.unref) limpieza.unref();

  return { handle, aplicarEvento, resumen };
}

// ── Instancia por defecto (la que usa el servicio) ──
let configurados = {};
try { configurados = JSON.parse(process.env.DISPOSITIVOS_JSON || '{}'); } catch (e) { console.error('[dispositivos] DISPOSITIVOS_JSON inválido:', e.message); }

function porDefecto() {
  const sesiones = require('./sesiones');
  return crearDispositivos({
    dispositivos: configurados,
    archivo: process.env.DISPOSITIVOS_FILE || path.join(__dirname, 'dispositivos.jsonl'),
    geolocalizar: sesiones.geolocalizar,
    nombrePorPersona: sesiones.nombrePorPersona,
    rolesResumen: sesiones.RESUMEN_ROLES,
    esIpPrivada: sesiones.esIpPrivada,
    ubicacionDeLaApp: sesiones.ubicacionDeLaApp,
  });
}

module.exports = { crearDispositivos, normalizarUsuario, mostrarUsuario, porDefecto };
