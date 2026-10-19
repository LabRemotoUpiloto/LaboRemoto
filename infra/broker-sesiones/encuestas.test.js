// Pruebas de encuestas.js (sin red). Ejecutar: node --test infra/broker-sesiones/encuestas.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { crearEncuestas, validarRespuestas } = require('./encuestas');

const ROLES = ['admin_lab', 'laboratorista'];
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'enc-')), 'encuestas.jsonl');

const BUENA = {
  aprendizaje: 5, claridad: 4, funcionamiento: 3, satisfaccion: 4, asistente: 'no_uso',
  dificultad: 'adecuada', problemas: ['lentitud'], gusto: 'La terminal real', mejorar: 'Que cargue más rápido',
};

function montar(archivo = tmp()) {
  const reloj = { t: Date.parse('2026-10-18T12:00:00Z') };
  return { e: crearEncuestas({ archivo, rolesResumen: ROLES, ahora: () => reloj.t }), reloj, archivo };
}

const verificar = async (jwt) => {
  if (jwt === 'malo') throw new Error('firma');
  const [usuario, rol] = jwt.split('|');
  return { preferred_username: usuario, realm_access: { roles: rol ? [rol] : [] } };
};

async function pedir(e, { metodo = 'GET', ruta, jwt = 'ana', cuerpo }) {
  const url = new URL('http://x' + ruta);
  const req = Readable.from(cuerpo === undefined ? [] : [Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))]);
  req.method = metodo;
  req.headers = jwt ? { authorization: 'Bearer ' + jwt } : {};
  let status; let texto = '';
  const res = { writeHead(s) { status = s; }, end(t) { texto = t || ''; } };
  const manejado = await e.handle(req, res, url, url.pathname.split('/').filter(Boolean), verificar);
  return { manejado, status, json: texto ? JSON.parse(texto) : null, texto };
}

const enviar = (e, jwt, practica, respuestas = BUENA) => pedir(e, { metodo: 'POST', ruta: '/nvr/encuestas', jwt, cuerpo: { practica, respuestas } });

test('validarRespuestas: exige las escalas 1–5, una dificultad válida y al menos un problema (o «ninguno» solo)', () => {
  assert.strictEqual(validarRespuestas(BUENA).ok, true);
  assert.strictEqual(validarRespuestas({ ...BUENA, aprendizaje: 6 }).error, 'aprendizaje_invalido');
  assert.strictEqual(validarRespuestas({ ...BUENA, claridad: '4' }).error, 'claridad_invalido');
  assert.strictEqual(validarRespuestas({ ...BUENA, asistente: 0 }).error, 'asistente_invalido');
  assert.strictEqual(validarRespuestas({ ...BUENA, dificultad: 'imposible' }).error, 'dificultad_invalida');
  assert.strictEqual(validarRespuestas({ ...BUENA, problemas: [] }).error, 'problemas_invalidos');
  assert.strictEqual(validarRespuestas({ ...BUENA, problemas: ['ninguno', 'lentitud'] }).error, 'problemas_invalidos');
  assert.strictEqual(validarRespuestas({ ...BUENA, problemas: ['hackeo'] }).error, 'problemas_invalidos');
  assert.strictEqual(validarRespuestas({ ...BUENA, mejorar: 'x'.repeat(5000) }).limpio.mejorar.length, 1000);
});

test('una respuesta por persona y práctica: la segunda la reemplaza; «mia» dice si ya respondió', async () => {
  const { e } = montar();
  assert.strictEqual((await pedir(e, { ruta: '/nvr/encuestas/mia?practica=linux' })).json.respondida, false);
  assert.strictEqual((await enviar(e, 'ana', 'linux')).status, 201);
  assert.strictEqual((await enviar(e, 'ana', 'linux', { ...BUENA, aprendizaje: 2 })).status, 200);
  assert.strictEqual((await pedir(e, { ruta: '/nvr/encuestas/mia?practica=linux' })).json.respondida, true);
  assert.strictEqual((await pedir(e, { ruta: '/nvr/encuestas/mia?practica=linux', jwt: 'ben' })).json.respondida, false);
  const r = e.resumen(90).practicas[0];
  assert.deepStrictEqual([r.practica, r.respuestas, r.promedios.aprendizaje], ['linux', 1, 2]);
});

test('el resumen exige rol de supervisión, es anónimo y agrega promedios, dificultad, problemas y comentarios', async () => {
  const { e } = montar();
  await enviar(e, 'ana', 'linux');
  await enviar(e, 'ben', 'linux', { ...BUENA, aprendizaje: 3, asistente: 4, dificultad: 'dificil', problemas: ['ninguno'], gusto: '', mejorar: '' });
  await enviar(e, 'ana', 'ev3');
  assert.strictEqual((await pedir(e, { ruta: '/nvr/encuestas/resumen' })).status, 403);
  assert.strictEqual((await pedir(e, { ruta: '/nvr/encuestas/resumen', jwt: null })).status, 401);
  const r = await pedir(e, { ruta: '/nvr/encuestas/resumen', jwt: 'jefa|laboratorista' });
  assert.strictEqual(r.status, 200);
  assert.doesNotMatch(r.texto, /"ana"|"ben"|usuario/);          // anónimo
  const linux = r.json.practicas.find((p) => p.practica === 'linux');
  assert.deepStrictEqual([linux.respuestas, linux.promedios.aprendizaje, linux.promedios.asistente, linux.asistenteNoUso], [2, 4, 4, 1]);
  assert.deepStrictEqual([linux.dificultad.adecuada, linux.dificultad.dificil], [1, 1]);
  assert.deepStrictEqual([linux.problemas.lentitud, linux.problemas.ninguno], [1, 1]);
  assert.deepStrictEqual(linux.comentarios.map((c) => c.mejorar), ['Que cargue más rápido']);   // el vacío no cuenta
  assert.strictEqual(r.json.practicas[0].practica, 'linux');                                     // más respuestas primero
});

test('rechaza sin token, práctica inválida o respuestas inválidas; no atiende rutas ajenas', async () => {
  const { e } = montar();
  assert.strictEqual((await enviar(e, null, 'linux')).status, 401);
  assert.strictEqual((await enviar(e, 'malo', 'linux')).status, 401);
  assert.strictEqual((await enviar(e, 'ana', '../etc')).status, 400);
  assert.strictEqual((await enviar(e, 'ana', 'linux', { ...BUENA, satisfaccion: 9 })).status, 400);
  assert.strictEqual((await pedir(e, { metodo: 'POST', ruta: '/nvr/encuestas', cuerpo: '{no json' })).status, 400);
  assert.strictEqual((await pedir(e, { ruta: '/nvr/sesiones/resumen' })).manejado, false);
});

test('persiste y al reiniciar conserva la última respuesta de cada persona', async () => {
  const archivo = tmp();
  const { e } = montar(archivo);
  await enviar(e, 'ana', 'linux');
  await enviar(e, 'ana', 'linux', { ...BUENA, satisfaccion: 1 });
  const { e: e2 } = montar(archivo);
  const r = e2.resumen(90).practicas[0];
  assert.deepStrictEqual([r.respuestas, r.promedios.satisfaccion], [1, 1]);
  assert.strictEqual(fs.readFileSync(archivo, 'utf8').trim().split('\n').length, 1);   // compactado
});
