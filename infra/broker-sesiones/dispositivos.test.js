// Pruebas del módulo de dispositivos (conexiones SSH). Ejecutar: node --test infra/broker-sesiones/dispositivos.test.js
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { crearDispositivos, normalizarUsuario } = require('./dispositivos');

const TOKEN = 'token-secreto-pi4';
const ROLES = ['admin_lab', 'jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista'];
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'disp-')), 'dispositivos.jsonl');

let app = () => null;
function montar({ archivo = tmp(), geo = async (ip) => ({ ciudad: 'Bogotá', region: 'Bogotá D.C.', pais: 'CO', lat: 4.6, lon: -74.08 }), nombres = {} } = {}) {
  const reloj = { t: Date.parse('2026-10-04T12:00:00Z') };
  const d = crearDispositivos({
    dispositivos: { pi4: { nombre: 'Pi4', token: TOKEN } }, archivo, geolocalizar: geo,
    nombrePorPersona: (p) => nombres[p] || null, rolesResumen: ROLES, ubicacionDeLaApp: (ip, t) => app(ip, t), esIpPrivada: (ip) => /^(10\.|172\.16\.)/.test(ip), ahora: () => reloj.t,
  });
  return { d, reloj, archivo };
}

const entrada = (sesion, usuario, ip = '203.0.113.7') => ({ dispositivo: 'pi4', tipo: 'entrada', sesion, usuario, ip });
const esperar = () => new Promise((r) => setImmediate(r));

async function post(d, cuerpo, token = TOKEN) {
  const req = Readable.from([Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))]);
  req.method = 'POST'; req.headers = token === null ? {} : { 'x-dispositivo-token': token };
  let status; let texto = '';
  await d.handle(req, { writeHead(s) { status = s; }, end(t) { texto = t || ''; } }, new URL('http://x/nvr/dispositivos/evento'), ['nvr', 'dispositivos', 'evento'], async () => ({}));
  return { status, json: texto ? JSON.parse(texto) : null };
}

async function get(d, { dias, roles = ['admin_lab'], jwt = 'ok' } = {}) {
  const url = new URL('http://x/nvr/dispositivos/resumen' + (dias ? `?dias=${dias}` : ''));
  const req = Readable.from([]); req.method = 'GET'; req.headers = jwt ? { authorization: 'Bearer ' + jwt } : {};
  let status; let texto = '';
  await d.handle(req, { writeHead(s) { status = s; }, end(t) { texto = t || ''; } }, url, ['nvr', 'dispositivos', 'resumen'], async (j) => { if (j === 'malo') throw new Error('x'); return { realm_access: { roles } }; });
  return { status, texto, json: texto ? JSON.parse(texto) : null };
}

test('normalizarUsuario unifica las formas del LDAP, cuenta la compartida, ignora la técnica y aparta lo desconocido', () => {
  for (const f of ['UPILOTO\\ana-perez', 'UPILOTO\\\\ana-perez', 'Upiloto\\\\\\\\ana-perez', 'UPILOTOana-perez', 'ana-perez@upiloto.edu', 'ANA-PEREZ@UPC.EDU.CO']) {
    assert.deepStrictEqual(normalizarUsuario(f), { tipo: 'ldap', persona: 'ana-perez' }, f);
  }
  assert.strictEqual(normalizarUsuario('pi').tipo, 'compartida');
  assert.strictEqual(normalizarUsuario('svc-practicas').tipo, 'ignorar');
  for (const f of ['root', 'x@gmail.com', 'UPILOTO', 'UPILOTO\\']) assert.strictEqual(normalizarUsuario(f).tipo, 'otro', f);
});

test('el agente se identifica con el token de su dispositivo; sin token, con uno malo o con un dispositivo desconocido da 403', async () => {
  const { d } = montar();
  assert.strictEqual((await post(d, entrada('1', 'UPILOTO\\ana'))).status, 201);
  assert.strictEqual((await post(d, entrada('2', 'UPILOTO\\ana'), 'otro-token')).status, 403);
  assert.strictEqual((await post(d, entrada('2', 'UPILOTO\\ana'), null)).status, 403);
  assert.strictEqual((await post(d, { ...entrada('2', 'UPILOTO\\ana'), dispositivo: 'pi9' })).status, 403);
  assert.strictEqual((await post(d, 'no es json')).status, 400);
});

test('una entrada del LDAP queda conectada, con ubicación por IP y sin tocar la ubicación si la IP es privada', async () => {
  const llamadas = [];
  const { d } = montar({ geo: async (ip) => { llamadas.push(ip); return ip.startsWith('10.') ? null : { ciudad: 'Bogotá', region: 'Cundinamarca', pais: 'CO', lat: 4.6, lon: -74.1 }; } });
  await post(d, entrada('100', 'UPILOTO\\\\ana-perez', '203.0.113.7'));
  await post(d, entrada('101', 'ben@upiloto.edu', '10.0.0.7'));
  await esperar(); await esperar();
  const r = (await get(d)).json.dispositivos[0];
  assert.strictEqual(r.nombre, 'Pi4');
  assert.deepStrictEqual(r.conectados.map((c) => [c.usuario, c.ip, c.ciudad, c.activa]).sort(), [['UPILOTO\\ana-perez', '203.0.113.7', 'Bogotá', true], ['UPILOTO\\ben', '10.0.0.7', null, true]]);
  assert.strictEqual(r.personasDistintas, 2);
});

test('la salida cierra la conexión con su hora; una salida desconocida o repetida no hace nada', async () => {
  const { d, reloj } = montar();
  await post(d, entrada('7', 'UPILOTO\\ana'));
  reloj.t += 5 * 60_000;
  assert.strictEqual((await post(d, { dispositivo: 'pi4', tipo: 'salida', sesion: '7' })).status, 200);
  assert.strictEqual((await post(d, { dispositivo: 'pi4', tipo: 'salida', sesion: '7' })).status, 200);
  assert.strictEqual((await post(d, { dispositivo: 'pi4', tipo: 'salida', sesion: '999' })).status, 200);
  const r = (await get(d)).json.dispositivos[0];
  assert.strictEqual(r.conectados.length, 0);
  assert.deepStrictEqual([r.conexiones[0].activa, r.conexiones[0].cierre, r.conexiones[0].fin], [false, 'cliente', '2026-10-04T12:05:00.000Z']);
});

test('la cuenta compartida pi solo se cuenta; svc-practicas se ignora; las cuentas raras quedan aparte para avisar', async () => {
  const { d } = montar();
  await post(d, entrada('1', 'pi', '172.16.34.52')); await post(d, entrada('2', 'pi', '10.0.0.9'));
  assert.strictEqual((await post(d, entrada('3', 'svc-practicas'))).json.ignorado, true);
  await post(d, entrada('4', 'root', '45.9.9.9'));
  await post(d, entrada('5', 'UPILOTO\\ana'));
  const r = (await get(d)).json.dispositivos[0];
  assert.deepStrictEqual(r.conexiones.map((c) => c.persona), ['ana']);
  assert.deepStrictEqual(r.cuentaCompartida, { nombre: 'pi', conexiones: 2, activas: 2 });
  assert.deepStrictEqual([r.noReconocidas.conexiones, r.noReconocidas.ultimas[0].usuario, r.noReconocidas.ultimas[0].ip], [1, 'root', '45.9.9.9']);
});

test('el latido marca el dispositivo en línea y cierra las sesiones que el agente ya no ve abiertas (con un margen para las recién abiertas)', async () => {
  const { d, reloj } = montar();
  assert.strictEqual((await get(d)).json.dispositivos[0].enLinea, false);
  await post(d, entrada('1', 'UPILOTO\\ana'));
  await post(d, entrada('2', 'UPILOTO\\ben'));
  reloj.t += 10_000;
  await post(d, { dispositivo: 'pi4', tipo: 'latido', abiertas: ['1'] });         // la 2 es reciente: no se cierra todavía
  assert.strictEqual((await get(d)).json.dispositivos[0].conectados.length, 2);
  reloj.t += 60_000;
  await post(d, { dispositivo: 'pi4', tipo: 'latido', abiertas: ['1'] });         // ya pasó el margen: la 2 se cierra
  let r = (await get(d)).json.dispositivos[0];
  assert.deepStrictEqual(r.conectados.map((c) => c.persona), ['ana']);
  assert.strictEqual(r.conexiones.find((c) => c.persona === 'ben').cierre, 'sin_cierre');
  assert.strictEqual(r.enLinea, true);
  reloj.t += 120_000;                                                               // el agente dejó de reportar
  r = (await get(d)).json.dispositivos[0];
  assert.strictEqual(r.enLinea, false);
});

test('un duplicado de una entrada ya abierta no crea otra conexión', async () => {
  const { d } = montar();
  await post(d, entrada('5', 'UPILOTO\\ana'));
  assert.strictEqual((await post(d, entrada('5', 'UPILOTO\\ana'))).json.duplicado, true);
  assert.strictEqual((await get(d)).json.dispositivos[0].totalConexiones, 1);
});

test('el nombre completo sale de la app si la persona ya la usó', async () => {
  const { d } = montar({ nombres: { ana: 'Ana Pérez' } });
  await post(d, entrada('1', 'UPILOTO\\ana'));
  await post(d, entrada('2', 'UPILOTO\\ben'));
  const r = (await get(d)).json.dispositivos[0];
  assert.deepStrictEqual(r.conexiones.map((c) => [c.persona, c.nombre]).sort(), [['ana', 'Ana Pérez'], ['ben', null]]);
});

test('datos inválidos del agente dan 400 y no crean nada', async () => {
  const { d } = montar();
  assert.strictEqual((await post(d, { ...entrada('x1', 'UPILOTO\\ana') })).status, 400);                       // sesión no numérica
  assert.strictEqual((await post(d, { ...entrada('1', 'UPILOTO\\ana', '<script>') })).status, 400);             // IP inválida
  assert.strictEqual((await post(d, { dispositivo: 'pi4', tipo: 'entrada', sesion: '1', ip: '1.2.3.4' })).status, 400); // sin usuario
  assert.strictEqual((await post(d, { dispositivo: 'pi4', tipo: 'otra' })).status, 400);
  assert.strictEqual((await get(d)).json.dispositivos[0].totalConexiones, 0);
});

test('resumen: exige JWT y rol de supervisión, filtra por días y no filtra tokens', async () => {
  const { d, reloj } = montar();
  await post(d, entrada('1', 'UPILOTO\\vieja'));
  await post(d, { dispositivo: 'pi4', tipo: 'salida', sesion: '1' });
  reloj.t += 40 * 86_400_000;
  await post(d, entrada('2', 'UPILOTO\\nueva'));
  assert.strictEqual((await get(d, { jwt: null })).status, 401);
  assert.strictEqual((await get(d, { jwt: 'malo' })).status, 401);
  for (const roles of [[], ['estudiante'], ['docente'], ['semillerista']]) assert.strictEqual((await get(d, { roles })).status, 403, roles.join());
  assert.strictEqual((await get(d, { roles: ['laboratorista'] })).status, 200);
  const r = await get(d, { dias: 30 });
  assert.deepStrictEqual(r.json.dispositivos[0].conexiones.map((c) => c.persona), ['nueva']);
  assert.deepStrictEqual((await get(d, { dias: 90 })).json.dispositivos[0].conexiones.map((c) => c.persona), ['nueva', 'vieja']);
  assert.ok(!r.texto.includes(TOKEN));
});

test('persistencia: al reiniciar recupera conexiones y las abiertas siguen abiertas; gana la última línea de cada una', async () => {
  const archivo = tmp();
  const a = montar({ archivo });
  await post(a.d, entrada('1', 'UPILOTO\\ana'));
  await post(a.d, entrada('2', 'UPILOTO\\ben'));
  await post(a.d, { dispositivo: 'pi4', tipo: 'salida', sesion: '2' });
  await esperar(); await esperar();
  const b = montar({ archivo });
  const r = (await get(b.d)).json.dispositivos[0];
  assert.deepStrictEqual(r.conectados.map((c) => c.persona), ['ana']);
  assert.strictEqual(r.totalConexiones, 2);
  assert.strictEqual(fs.readFileSync(archivo, 'utf8').trim().split('\n').length, 2, 'queda compactado: una línea por conexión');
  await post(b.d, { dispositivo: 'pi4', tipo: 'salida', sesion: '1' });          // la salida de una sesión abierta antes del reinicio funciona
  assert.strictEqual((await get(b.d)).json.dispositivos[0].conectados.length, 0);
});

test('la retención descarta lo de más de 90 días al cargar', () => {
  const archivo = tmp();
  const viejo = { id: 'pi4:1:1', dispositivo: 'pi4', sesion: '1', tipo: 'ldap', persona: 'x', usuario: 'UPILOTO\\x', ip: '1.1.1.1', inicio: '2026-05-01T10:00:00.000Z', fin: '2026-05-01T10:05:00.000Z', cierre: 'cliente' };
  fs.writeFileSync(archivo, JSON.stringify(viejo) + '\n');
  const { d } = montar({ archivo });
  assert.strictEqual(d.resumen(90).dispositivos[0].totalConexiones, 0);
});

test('rutas que no son de dispositivos se ignoran', async () => {
  const { d } = montar();
  const req = Readable.from([]); req.method = 'GET'; req.headers = {};
  const r = await d.handle(req, {}, new URL('http://x/nvr/sesiones/resumen'), ['nvr', 'sesiones', 'resumen'], async () => ({}));
  assert.strictEqual(r, false);
});

test('la cuenta compartida pi entrando desde fuera de la red del laboratorio sí aparece en la lista, sin contar como persona del LDAP', async () => {
  const { d } = montar();
  await post(d, entrada('1', 'pi', '172.16.34.52'));       // automática (puente EV3): solo se cuenta
  await post(d, entrada('2', 'pi'));                         // desde internet: es una persona
  const r = (await get(d)).json.dispositivos[0];
  assert.deepStrictEqual(r.conexiones.map((c) => [c.usuario, c.persona, c.ip]), [['pi (cuenta compartida)', null, '203.0.113.7']]);
  assert.strictEqual(r.conectados.length, 1);
  assert.strictEqual(r.personasDistintas, 0);
  assert.deepStrictEqual(r.cuentaCompartida, { nombre: 'pi', conexiones: 2, activas: 2 });
});

test('si la misma IP tiene una práctica con la ubicación exacta del equipo, la conexión SSH usa esa en vez de la aproximada por IP', async () => {
  const { d, reloj } = montar();
  const llamadas = [];
  app = (ip, t) => { llamadas.push([ip, t]); return { ciudad: 'Chapinero, Bogotá', region: 'Bogotá D.C.', pais: 'CO', lat: 4.65, lon: -74.06, precision_m: 20 }; };
  try {
    await post(d, entrada('1', 'UPILOTO\ana'));
    await esperar();
    let c = (await get(d)).json.dispositivos[0].conexiones[0];
    assert.deepStrictEqual([c.ciudad, c.lat, c.lon], ['Chapinero, Bogotá', 4.65, -74.06]);
    assert.deepStrictEqual(llamadas[0], ['203.0.113.7', reloj.t]);
    app = () => null;                       // más tarde ya no hay práctica: se conserva la exacta
    c = (await get(d)).json.dispositivos[0].conexiones[0];
    assert.strictEqual(c.lat, 4.65);
  } finally { app = () => null; }
});
