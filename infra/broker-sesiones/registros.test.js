// Pruebas de registros.js (sin red). Ejecutar: node --test infra/broker-sesiones/registros.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { Readable } = require('node:stream');
const { crearRegistros, carpetaDe, nombreParaArchivo, fechaParaArchivo, momentoDe, puedeLeer, MAX_BODY } = require('./registros');

const DIA = 86_400_000;
const HTML = '<!DOCTYPE html><html><body><pre>ana@pi:~ $ pwd\n/home/ana</pre></body></html>';
const gz = (texto) => zlib.gzipSync(Buffer.from(texto)).toString('base64');

function montar(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'))) {
  const reloj = { t: Date.parse('2026-10-28T19:30:00Z') }; // 14:30 en Bogotá
  return { r: crearRegistros({ dir, ahora: () => reloj.t, revisarSolo: false }), dir, reloj };
}

/** jwt «usuario|Nombre Completo|rol» (el verificador falso lo parte); el rol «Docente» llega como user_type */
const verificar = async (jwt) => {
  if (jwt === 'malo') throw new Error('firma');
  const [usuario, nombre, rol] = jwt.split('|');
  if (rol === 'Docente') return { preferred_username: usuario, name: nombre, user_type: 'Docente', realm_access: { roles: [] } };
  return { preferred_username: usuario, name: nombre, realm_access: { roles: rol ? [rol] : [] } };
};
const ANA = 'ana-perez|ANA MARÍA Pérez';
const ADMIN = 'admin|Admin|admin_lab';

async function pedir(r, { metodo = 'POST', ruta = '/nvr/registros', jwt = ANA, cuerpo }) {
  const url = new URL('http://x' + ruta);
  const datos = cuerpo === undefined ? [] : [Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))];
  const req = Readable.from(datos);
  req.method = metodo;
  req.headers = jwt ? { authorization: 'Bearer ' + jwt } : {};
  let status; let cabeceras = {}; let texto = '';
  const res = { writeHead(s, h) { status = s; cabeceras = h || {}; }, end(t) { texto = t ? String(t) : ''; } };
  const manejado = await r.handle(req, res, url, url.pathname.split('/').filter(Boolean), verificar);
  let json = null;
  try { json = JSON.parse(texto); } catch { /* html */ }
  return { manejado, status, json, texto, cabeceras };
}

const envio = (extra = {}) => ({
  id: 'intento-0001', practica: 'linux-m1', practicaNombre: 'Primeros pasos', estado: 'sin_terminar',
  inicio: '2026-10-28T19:05:07Z', fin: '2026-10-28T19:25:00Z', gzipBase64: gz(HTML), ...extra,
});
const enviar = (r, extra, jwt = ANA) => pedir(r, { jwt, cuerpo: envio(extra) });

test('guarda el intento en la carpeta de la persona, con su nombre, la práctica y la hora de inicio en Bogotá', async () => {
  const { r, dir } = montar();
  const res = await enviar(r);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.json.archivo, 'ana-perez/Ana-Maria-Perez_linux-m1_2026-10-28_14-05-07.html');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'ana-perez', 'Ana-Maria-Perez_linux-m1_2026-10-28_14-05-07.html'), 'utf8'), HTML);
});

test('el mismo intento se reemplaza: un solo archivo, con el contenido y el estado más nuevos', async () => {
  const { r, dir } = montar();
  await enviar(r);
  const b = await enviar(r, { estado: 'terminada', nota: 100, fin: '2026-10-28T19:28:00Z', gzipBase64: gz(HTML + '<!-- más -->') });
  assert.strictEqual(b.status, 200);
  const archivos = fs.readdirSync(path.join(dir, 'ana-perez'));
  assert.deepStrictEqual(archivos, ['Ana-Maria-Perez_linux-m1_2026-10-28_14-05-07.html']);
  assert.match(fs.readFileSync(path.join(dir, 'ana-perez', archivos[0]), 'utf8'), /más/);
  // aprobada, cerrar la pestaña después no la vuelve «sin terminar» ni borra la nota
  await enviar(r, { estado: 'sin_terminar', fin: '2026-10-28T19:29:00Z' });
  const [x] = r.lista(20).registros;
  assert.deepStrictEqual([x.estado, x.nota, x.fin], ['terminada', 100, '2026-10-28T19:29:00.000Z']);
  // otro intento de la misma práctica es otro archivo
  assert.strictEqual((await enviar(r, { id: 'intento-0002' })).status, 201);
  assert.strictEqual(fs.readdirSync(path.join(dir, 'ana-perez')).length, 2);
});

test('tras reiniciar el broker el índice sigue sabiendo qué archivo es de cada intento', async () => {
  const { r, dir } = montar();
  await enviar(r);
  await enviar(r, { estado: 'terminada' });
  const otra = montar(dir).r;
  assert.strictEqual((await enviar(otra, { estado: 'app_cerrada' })).status, 200);
  assert.strictEqual(otra.lista(20).registros.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'registros.jsonl'), 'utf8').trim().split('\n').length, 2); // compactado + el último
});

test('la carpeta sale del token: el cuerpo no puede elegir la de otro', async () => {
  const { r, dir } = montar();
  const res = await enviar(r, { usuario: 'ana-perez', carpeta: '../ana-perez' }, 'UPILOTO\\Beto.Ruiz|Beto Ruiz');
  assert.strictEqual(res.status, 201);
  assert.ok(res.json.archivo.startsWith('beto.ruiz/Beto-Ruiz_'));
  assert.ok(!fs.existsSync(path.join(dir, 'ana-perez')));
});

test('exige token y valida el envío', async () => {
  const { r } = montar();
  assert.strictEqual((await enviar(r, {}, null)).status, 401);
  assert.strictEqual((await enviar(r, {}, 'malo')).status, 401);
  assert.strictEqual((await enviar(r, { id: 'x' })).json.error, 'id_invalido');
  assert.strictEqual((await enviar(r, { practica: '../etc' })).json.error, 'practica_invalida');
  assert.strictEqual((await enviar(r, { estado: 'borrada' })).json.error, 'estado_invalido');
  assert.strictEqual((await enviar(r, { gzipBase64: '' })).json.error, 'registro_vacio');
  assert.strictEqual((await enviar(r, { gzipBase64: 'no es gzip' })).json.error, 'registro_invalido');
  assert.strictEqual((await enviar(r, { gzipBase64: gz('<script>hola</script>') })).json.error, 'registro_invalido');
  assert.strictEqual((await pedir(r, { cuerpo: '{roto' })).status, 400);
  await enviar(r);
  assert.strictEqual((await enviar(r, { practica: 'linux-m2' })).status, 409); // un intento no cambia de práctica
});

test('un cuerpo demasiado grande se rechaza con 413 (para que la app no lo reintente)', async () => {
  const { r } = montar();
  assert.strictEqual((await enviar(r, { gzipBase64: 'A'.repeat(MAX_BODY + 10) })).status, 413);
});

test('leer: solo admin_lab, semillerista o docente; la lista no expone rutas y el archivo se pide por el índice', async () => {
  const { r } = montar();
  await enviar(r, { estado: 'terminada', nota: 90 });
  assert.strictEqual((await pedir(r, { metodo: 'GET', jwt: ANA })).status, 403);
  assert.strictEqual((await pedir(r, { metodo: 'GET', jwt: 'jefa|Jefa|jefe_laboratorio' })).status, 403);
  for (const jwt of [ADMIN, 'semi|Semi|semillerista', 'prof|Profe|Docente']) {
    assert.strictEqual((await pedir(r, { metodo: 'GET', jwt })).status, 200, jwt);
  }
  const lista = (await pedir(r, { metodo: 'GET', jwt: ADMIN })).json;
  const [x] = lista.registros;
  assert.deepStrictEqual([x.carpeta, x.nombre, x.practica, x.estado, x.nota], ['ana-perez', 'ANA MARÍA Pérez', 'linux-m1', 'terminada', 90]);
  assert.strictEqual(x.archivo, 'Ana-Maria-Perez_linux-m1_2026-10-28_14-05-07.html');
  const html = await pedir(r, { metodo: 'GET', ruta: `/nvr/registros/archivo?carpeta=ana-perez&id=${x.id}`, jwt: ADMIN });
  assert.strictEqual(html.status, 200);
  assert.match(html.cabeceras['Content-Type'], /text\/html/);
  assert.strictEqual(html.texto, HTML);
  assert.strictEqual((await pedir(r, { metodo: 'GET', ruta: `/nvr/registros/archivo?carpeta=ana-perez&id=${x.id}`, jwt: ANA })).status, 403);
  assert.strictEqual((await pedir(r, { metodo: 'GET', ruta: '/nvr/registros/archivo?carpeta=..&id=intento-0001', jwt: ADMIN })).status, 404);
  assert.strictEqual((await pedir(r, { metodo: 'GET', ruta: '/nvr/registros/archivo?carpeta=ana-perez&id=otro-intento', jwt: ADMIN })).status, 404);
});

test('a los 20 días se borran el archivo, la entrada y la carpeta vacía', async () => {
  const { r, dir, reloj } = montar();
  await enviar(r);
  reloj.t += 19 * DIA;
  await enviar(r, { id: 'intento-0002', inicio: new Date(reloj.t - 60_000).toISOString(), fin: new Date(reloj.t).toISOString() }, 'beto|Beto Ruiz');
  assert.strictEqual(r.borrarVencidos(), 0);
  reloj.t += 2 * DIA;
  assert.strictEqual(r.borrarVencidos(), 1);
  assert.ok(!fs.existsSync(path.join(dir, 'ana-perez')));
  assert.strictEqual(fs.readdirSync(path.join(dir, 'beto')).length, 1);
  assert.deepStrictEqual(r.lista(20).registros.map((x) => x.carpeta), ['beto']);
});

test('solo atiende /nvr/registros', async () => {
  const { r } = montar();
  assert.strictEqual((await pedir(r, { ruta: '/nvr/registros/x' })).manejado, false);
  assert.strictEqual((await pedir(r, { metodo: 'DELETE' })).manejado, false);
  assert.strictEqual((await pedir(r, { ruta: '/nvr/sesiones' })).manejado, false);
});

test('nombres, fechas y permisos', () => {
  const AHORA = Date.parse('2026-10-28T19:30:00Z');
  assert.strictEqual(carpetaDe('UPILOTO\\Ana.Perez'), 'ana.perez');
  assert.strictEqual(carpetaDe('ana@upiloto.edu'), 'ana');
  assert.strictEqual(carpetaDe('../../root'), 'root');
  assert.strictEqual(carpetaDe(''), null);
  assert.strictEqual(nombreParaArchivo('  JOSÉ  ñandú o\'brien '), 'Jose-Nandu-O-Brien');
  assert.strictEqual(fechaParaArchivo(Date.parse('2026-10-29T03:05:09Z')), '2026-10-28_22-05-09');
  assert.strictEqual(momentoDe('2026-10-27T10:00:00Z', AHORA), Date.parse('2026-10-27T10:00:00Z'));
  assert.strictEqual(momentoDe('2026-11-28T10:00:00Z', AHORA), AHORA);
  assert.strictEqual(momentoDe('2025-01-01T10:00:00Z', AHORA), AHORA);
  assert.strictEqual(momentoDe('ayer', AHORA, 5), 5);
  assert.strictEqual(puedeLeer({ realm_access: { roles: ['semillerista'] } }), true);
  assert.strictEqual(puedeLeer({ user_type: 'Docente' }), true);
  assert.strictEqual(puedeLeer({ user_type: 'Estudiante', realm_access: { roles: ['laboratorista'] } }), false);
});
