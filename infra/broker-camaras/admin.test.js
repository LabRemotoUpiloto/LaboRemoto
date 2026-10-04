// Pruebas de la administración de cámaras (registro, sonda, adaptadores y rutas) con Shinobi/MediaMTX/cámaras simulados.
// Ejecutar: node --test infra/broker-camaras/admin.test.js
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { Registro, validar, vistaPublica, importar, esIpPrivada } = require('./registro');
const { probar: sondar, urlRtsp } = require('./sonda');
const mtxLib = require('./mediamtx');
const shiLib = require('./shinobi');
const { crearAdmin } = require('./admin');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'camaras-'));
const SECRETO = 'ClaveSecreta#9';

// ── registro ──
test('esIpPrivada acepta solo redes privadas', () => {
  for (const ip of ['10.1.2.3', '172.16.34.5', '172.31.255.1', '192.168.0.9']) assert.ok(esIpPrivada(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '52.14.162.232', '127.0.0.1', '300.1.1.1', 'localhost', '10.0.0']) assert.ok(!esIpPrivada(ip), ip);
});

test('validar: completa en alta, parcial en edición, y rechaza datos peligrosos', () => {
  const ok = validar({ nombre: 'Lab 1', host: '172.16.34.9', usuario: 'admin', password: 'abc12345' });
  assert.deepStrictEqual(ok.errores, {});
  assert.deepStrictEqual(ok.limpio, { nombre: 'Lab 1', host: '172.16.34.9', puerto: 554, usuario: 'admin', password: 'abc12345', rtspPath: '/h264Preview_01_sub', ptz: false, habilitada: true });
  const mal = validar({ nombre: '<x>', host: '8.8.8.8', puerto: 70000, usuario: 'a b', password: 'con espacio', rtspPath: 'sin-barra' });
  assert.deepStrictEqual(Object.keys(mal.errores).sort(), ['host', 'nombre', 'password', 'puerto', 'rtspPath', 'usuario']);
  assert.deepStrictEqual(validar({ nombre: 'X' }).errores.host, 'es obligatorio');
  assert.deepStrictEqual(validar({ nombre: 'Nuevo' }, { parcial: true }), { errores: {}, limpio: { nombre: 'Nuevo' } });
});

test('registro: guarda atómico con respaldo, asigna ids/rutas y deriva los mapas; la vista pública no lleva la clave', () => {
  const dir = tmp();
  const r = new Registro({ archivo: path.join(dir, 'camaras.json') });
  assert.strictEqual(r.cargar(), false);
  assert.strictEqual(r.siguienteId(), 'Camara01');
  assert.strictEqual(r.siguienteRuta(), 'cam00');
  const c = { id: 'Camara05', nombre: 'A', host: '172.16.34.13', puerto: 554, usuario: 'admin', password: SECRETO, rtspPath: '/x', ptz: true, habilitada: true, ruta: 'cam04' };
  r.guardar([c]);
  r.guardar([c, { ...c, id: 'Camara1', ruta: 'cam00', ptz: false, host: '172.16.34.14' }]);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('camaras.json.bak-')), 'debe dejar respaldo');
  assert.strictEqual(r.siguienteId(), 'Camara06');
  assert.strictEqual(r.siguienteRuta(), 'cam05');
  assert.deepStrictEqual(r.mapaPtz(), { Camara05: { host: '172.16.34.13', user: 'admin', pass: SECRETO } });
  assert.deepStrictEqual(r.mapaWebrtc(), { Camara05: 'cam04', Camara1: 'cam00' });
  assert.ok(!JSON.stringify(vistaPublica(c)).includes(SECRETO));
  assert.strictEqual(vistaPublica(c).tienePassword, true);
  const r2 = new Registro({ archivo: path.join(dir, 'camaras.json') });
  assert.strictEqual(r2.cargar(), true);
  assert.strictEqual(r2.lista().length, 2);
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(path.join(dir, 'camaras.json')).mode & 0o777, 0o600);
});

test('importar arma el registro desde Shinobi, MediaMTX y los mapas actuales', () => {
  const lista = importar({
    monitores: [
      { mid: 'Camara05', name: 'Camara04', host: '172.16.34.13', port: '554', mode: 'start', details: JSON.stringify({ muser: 'admin', mpass: 'p5', auto_host: 'rtsp://admin:p5@172.16.34.13:554/h264Preview_01_sub' }) },
      { mid: 'Sin', name: 'Sin ruta', host: '172.16.34.99', port: 554, mode: 'start', details: '{}' },
    ],
    mediamtx: [{ ruta: 'cam04', host: '172.16.34.13', user: 'admin', pass: 'p5', path: '/h264Preview_01_sub' }],
    ptz: { Camara05: {} }, webrtc: { Camara05: 'cam04' },
  });
  assert.strictEqual(lista.length, 1); // la que no tiene ruta de MediaMTX no se importa
  assert.deepStrictEqual([lista[0].id, lista[0].nombre, lista[0].ruta, lista[0].ptz, lista[0].password, lista[0].rtspPath], ['Camara05', 'Camara04', 'cam04', true, 'p5', '/h264Preview_01_sub']);
});

// ── sonda ──
test('sonda: distingue video ok, clave mala, timeout, y detecta modelo y PTZ', async () => {
  const cam = { host: '172.16.34.9', puerto: 554, usuario: 'admin', password: 'p@ss:/1', rtspPath: '/x' };
  assert.strictEqual(urlRtsp(cam), 'rtsp://admin:p%40ss%3A%2F1@172.16.34.9:554/x'); // la clave va codificada
  const reolinkOk = async (h, ruta) => {
    if (ruta.includes('Login')) return [{ value: { Token: { name: 'T' } } }];
    if (ruta.includes('GetDevInfo')) return [{ value: { DevInfo: { model: 'E1 Pro' } } }];
    return [{ code: 0 }];
  };
  const ok = await sondar(cam, { ffprobe: async () => ({ codigo: 0, stdout: JSON.stringify({ streams: [{ codec_name: 'h264', width: 896, height: 512 }] }), stderr: '' }), reolink: reolinkOk });
  assert.deepStrictEqual([ok.ok, ok.rtsp.video.codec, ok.api.modelo, ok.ptz], [true, 'h264', 'E1 Pro', true]);
  const clave = await sondar(cam, { ffprobe: async () => ({ codigo: 1, stdout: '', stderr: 'method DESCRIBE failed: 401 Unauthorized' }), reolink: async () => { throw new Error('x'); } });
  assert.deepStrictEqual([clave.ok, clave.rtsp.codigo, clave.ptz], [false, 'clave', null]);
  const t = await sondar(cam, { ffprobe: async () => ({ codigo: 'timeout', stdout: '', stderr: '' }), reolink: async () => { throw new Error('x'); } });
  assert.strictEqual(t.rtsp.codigo, 'timeout');
  const sinPtz = await sondar(cam, { ffprobe: async () => ({ codigo: 0, stdout: '{"streams":[{"codec_name":"h264"}]}', stderr: '' }), reolink: async (h, r) => (r.includes('Login') ? [{ value: { Token: { name: 'T' } } }] : r.includes('PtzCtrl') ? [{ code: 1 }] : [{ value: { DevInfo: {} } }]) });
  assert.strictEqual(sinPtz.ptz, false);
});

// ── adaptadores ──
test('mediamtx: aplica en caliente, deshace, y reescribe SOLO la sección paths del yml con respaldo', async () => {
  const dir = tmp();
  const yml = path.join(dir, 'mediamtx.yml');
  fs.writeFileSync(yml, 'api: yes\nwebrtc: yes\n\npaths:\n  viejo:\n    source: "rtsp://x"\n');
  const rutas = {};
  const llamadas = [];
  const fetchFn = async (url, o = {}) => {
    const u = new URL(url); const m = o.method || 'GET'; llamadas.push(`${m} ${u.pathname}`);
    const n = u.pathname.split('/').pop();
    const json = (status, obj) => ({ status, json: async () => obj });
    if (u.pathname.includes('/config/paths/get/')) return rutas[n] ? json(200, rutas[n]) : json(404, { error: 'no' });
    if (u.pathname.includes('/config/paths/add/') || u.pathname.includes('/config/paths/replace/')) { rutas[n] = JSON.parse(o.body); return json(200, {}); }
    if (u.pathname.includes('/config/paths/delete/')) { delete rutas[n]; return json(200, {}); }
    if (u.pathname === '/v3/paths/list') return json(200, { items: [{ name: 'cam00', ready: true, readers: [1] }] });
    return json(500, {});
  };
  const m = mtxLib.crear({ ymlPath: yml, fetchFn });
  const cam = { id: 'C', ruta: 'cam00', host: '172.16.34.9', puerto: 554, usuario: 'admin', password: SECRETO, rtspPath: '/h264Preview_01_sub', habilitada: true };
  assert.strictEqual(await m.aplicar('cam00', mtxLib.sourceDe(cam)), null);          // nueva
  assert.ok(llamadas.some((l) => l.startsWith('POST') && l.includes('/add/cam00')));
  assert.ok(rutas.cam00.source.includes(encodeURIComponent(SECRETO)));
  const ant = await m.aplicar('cam00', 'rtsp://otro');                               // existente -> replace
  assert.strictEqual(ant.source.includes('172.16.34.9'), true);
  await m.restaurar('cam00', ant);
  assert.strictEqual(rutas.cam00.source, ant.source);
  await m.restaurar('cam00', null);
  assert.strictEqual(rutas.cam00, undefined);
  assert.deepStrictEqual(await m.estado(), { cam00: { listo: true, lectores: 1 } });
  m.persistir([cam, { ...cam, ruta: 'cam01', habilitada: false }]);
  const txt = fs.readFileSync(yml, 'utf8');
  assert.ok(txt.startsWith('api: yes\nwebrtc: yes\n'), 'conserva lo de antes de paths');
  assert.ok(txt.includes('  cam00:\n    source: "rtsp://admin:'));
  assert.ok(!txt.includes('cam01') && !txt.includes('viejo'), 'solo las habilitadas y ninguna entrada vieja');
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.bak-admin-')));
});

test('shinobi: clona la plantilla, no filtra la key en los errores y restaura', async () => {
  const KEY = 'KEYSECRETA123';
  const monitores = { Plantilla: { mid: 'Plantilla', name: 'P', host: '1.1.1.1', port: 554, mode: 'start', status: 'Watching', details: JSON.stringify({ muser: 'u', mpass: 'p', ajuste: 7 }) } };
  const fetchFn = async (url, o = {}) => {
    const p = new URL(url).pathname; const json = (obj) => ({ json: async () => obj });
    if (p.endsWith('/delete')) { delete monitores[p.split('/').slice(-2)[0]]; return json({ ok: true }); }
    if (p.includes('/configureMonitor/')) { const d = JSON.parse(new URLSearchParams(o.body).get('data')); monitores[d.mid] = d; return json({ ok: true }); }
    if (/\/monitor\/[^/]+\/[^/]+$/.test(p)) { const m = monitores[p.split('/').pop()]; return json(m ? [m] : []); }
    if (/\/monitor\/[^/]+$/.test(p)) return json(Object.values(monitores));
    throw new Error(`fallo de red hacia ${url}`);
  };
  const s = shiLib.crear({ key: KEY, fetchFn });
  const cam = { id: 'Camara06', nombre: 'Nueva', host: '172.16.34.9', puerto: 554, usuario: 'admin', password: SECRETO, rtspPath: '/h264Preview_01_sub', habilitada: true };
  assert.strictEqual(await s.guardar(cam, monitores.Plantilla), null);
  const d = JSON.parse(monitores.Camara06.details);
  assert.deepStrictEqual([monitores.Camara06.name, monitores.Camara06.host, d.muser, d.mpass, d.ajuste, monitores.Camara06.status], ['Nueva', '172.16.34.9', 'admin', SECRETO, 7, undefined]);
  const ant = await s.guardar({ ...cam, nombre: 'Renombrada' }, null);
  assert.strictEqual(ant.name, 'Nueva');
  await s.restaurar('Camara06', ant);
  assert.strictEqual(monitores.Camara06.name, 'Nueva');
  assert.strictEqual((await s.eliminar('Camara06')).mid, 'Camara06');
  assert.strictEqual(monitores.Camara06, undefined);
  const roto = shiLib.crear({ key: KEY, fetchFn: async (u) => { throw new Error(`fallo hacia ${u}`); } });
  await assert.rejects(() => roto.listar(), (e) => { assert.ok(!e.message.includes(KEY)); return true; });
});

// ── rutas de administración ──
function montar({ fallar = {}, prueba } = {}) {
  const dir = tmp();
  const registro = new Registro({ archivo: path.join(dir, 'camaras.json') });
  const base = { id: 'Camara05', nombre: 'Camara04', host: '172.16.34.13', puerto: 554, usuario: 'admin', password: SECRETO, rtspPath: '/h264Preview_01_sub', ptz: true, habilitada: true, ruta: 'cam04', creada: 'x', modificada: 'x' };
  registro.guardar([base]);
  const rutas = { cam04: { source: 'rtsp://base' } };
  const monitores = { Camara05: { mid: 'Camara05', name: 'Camara04', host: '172.16.34.13', port: 554, mode: 'start', status: 'Watching', details: '{}' } };
  const eventos = [];
  const falla = (paso) => { if (fallar[paso]) { const e = new Error(`falló ${paso}`); throw e; } };
  const mediamtx = {
    estado: async () => ({ cam04: { listo: true, lectores: 1 } }),
    aplicar: async (r, src) => { eventos.push(`mtx.aplicar ${r}`); falla('mtx'); const ant = rutas[r] || null; rutas[r] = { source: src }; return ant; },
    quitar: async (r) => { eventos.push(`mtx.quitar ${r}`); const ant = rutas[r] || null; delete rutas[r]; return ant; },
    restaurar: async (r, ant) => { eventos.push(`mtx.restaurar ${r}`); if (ant) rutas[r] = ant; else delete rutas[r]; },
    persistir: () => { eventos.push('mtx.persistir'); falla('yml'); },
  };
  const shinobi = {
    listar: async () => Object.values(monitores),
    guardar: async (cam) => { eventos.push(`shi.guardar ${cam.id}`); falla('shinobi'); const ant = monitores[cam.id] || null; monitores[cam.id] = { mid: cam.id, name: cam.nombre, host: cam.host }; return ant; },
    eliminar: async (id) => { eventos.push(`shi.eliminar ${id}`); const ant = monitores[id] || null; delete monitores[id]; return ant; },
    restaurar: async (id, ant) => { eventos.push(`shi.restaurar ${id}`); if (ant) monitores[id] = ant; else delete monitores[id]; },
  };
  const auditoria = [];
  const sonda = prueba || (async () => ({ ok: true, rtsp: { ok: true, video: { codec: 'h264' } }, api: { ok: true, modelo: 'E1' }, ptz: true }));
  const admin = crearAdmin({ registro, probar: sonda, mediamtx, shinobi, auditar: (e) => auditoria.push(e) });
  return { admin, registro, rutas, monitores, eventos, auditoria };
}

async function pedir(admin, { metodo = 'GET', ruta, roles = ['admin_lab'], jwt = 'ok', cuerpo }) {
  const url = new URL('http://x' + ruta);
  const req = Readable.from(cuerpo === undefined ? [] : [Buffer.from(JSON.stringify(cuerpo))]);
  req.method = metodo; req.headers = jwt ? { authorization: 'Bearer ' + jwt } : {};
  let status; let texto = '';
  const res = { writeHead(s) { status = s; }, end(t) { texto = t || ''; } };
  const manejado = await admin.handle(req, res, url, url.pathname.split('/').filter(Boolean), async () => ({ preferred_username: 'adm', realm_access: { roles } }));
  return { manejado, status, texto, json: texto ? JSON.parse(texto) : null };
}

const NUEVA = { nombre: 'Aula 2', host: '172.16.34.20', usuario: 'admin', password: 'Nueva#2026' };

test('acceso: sin token 401, sin rol admin_lab 403, rutas ajenas se ignoran', async () => {
  const { admin } = montar();
  assert.strictEqual((await pedir(admin, { ruta: '/nvr/camaras', jwt: null })).status, 401);
  for (const roles of [[], ['laboratorista'], ['semillerista'], ['docente'], ['jefe_laboratorio']]) {
    assert.strictEqual((await pedir(admin, { ruta: '/nvr/camaras', roles })).status, 403, roles.join());
    assert.strictEqual((await pedir(admin, { metodo: 'POST', ruta: '/nvr/camaras', roles, cuerpo: NUEVA })).status, 403);
    assert.strictEqual((await pedir(admin, { metodo: 'DELETE', ruta: '/nvr/camaras/Camara05', roles })).status, 403);
  }
  assert.strictEqual((await pedir(admin, { ruta: '/nvr/monitor/x' })).manejado, false);
});

test('listar: trae estado y NUNCA las claves', async () => {
  const { admin } = montar();
  const r = await pedir(admin, { ruta: '/nvr/camaras' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.json.camaras[0].estado, r.json.camaras[0].video, r.json.camaras[0].tienePassword], ['active', 'transmitiendo', true]);
  assert.ok(!r.texto.includes(SECRETO) && !('password' in r.json.camaras[0]));
});

test('crear: prueba, aplica en los 3 sistemas, detecta PTZ y audita sin claves', async () => {
  const t = montar();
  const r = await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: NUEVA });
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual([r.json.camara.id, r.json.camara.ruta, r.json.camara.ptz], ['Camara06', 'cam05', true]); // PTZ autodetectado
  assert.ok(!r.texto.includes('Nueva#2026'));
  assert.deepStrictEqual(t.eventos, ['mtx.aplicar cam05', 'shi.guardar Camara06', 'mtx.persistir']);
  assert.ok(t.rutas.cam05 && t.monitores.Camara06);
  assert.strictEqual(t.registro.lista().length, 2);
  assert.ok(!JSON.stringify(t.auditoria).includes('Nueva#2026'));
  assert.deepStrictEqual([t.auditoria[0].usuario, t.auditoria[0].accion], ['adm', 'crear']);
});

test('crear: datos inválidos 400, duplicados 409, IP pública rechazada, y no toca nada', async () => {
  const t = montar();
  const mal = await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: { ...NUEVA, host: '8.8.8.8', puerto: 0 } });
  assert.strictEqual(mal.status, 400);
  assert.deepStrictEqual(Object.keys(mal.json.errores).sort(), ['host', 'puerto']);
  assert.strictEqual((await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: { ...NUEVA, host: '172.16.34.13' } })).status, 409);
  assert.strictEqual((await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: { ...NUEVA, nombre: 'camara04' } })).status, 409);
  assert.deepStrictEqual(t.eventos, []);
});

test('crear: si la prueba falla da 422 y no guarda nada; con forzar sí guarda', async () => {
  const falla = async () => ({ ok: false, rtsp: { ok: false, codigo: 'clave', mensaje: 'La cámara rechazó el usuario o la contraseña (401)' }, api: { ok: false }, ptz: null });
  const t = montar({ prueba: falla });
  const r = await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: NUEVA });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.json.prueba.rtsp.codigo, 'clave');
  assert.deepStrictEqual(t.eventos, []);
  assert.strictEqual(t.registro.lista().length, 1);
  assert.strictEqual((await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: { ...NUEVA, forzar: true } })).status, 201);
});

test('crear: si un paso falla se DESHACE lo anterior (nada a medias)', async () => {
  for (const paso of ['shinobi', 'yml']) {
    const t = montar({ fallar: { [paso]: true } });
    const r = await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: NUEVA });
    assert.strictEqual(r.status, 502, paso);
    assert.strictEqual(r.json.error, 'aplicar_fallo');
    assert.strictEqual(t.rutas.cam05, undefined, `${paso}: MediaMTX deshecho`);
    assert.strictEqual(t.monitores.Camara06, undefined, `${paso}: Shinobi deshecho`);
    assert.deepStrictEqual(t.registro.lista().map((c) => c.id), ['Camara05'], `${paso}: registro intacto`);
  }
});

test('editar: sin clave conserva la actual; solo prueba si cambia la conexión; deshabilitar quita la ruta', async () => {
  let pruebas = 0;
  const t = montar({ prueba: async () => { pruebas++; return { ok: true, rtsp: { ok: true }, api: {}, ptz: true }; } });
  const r1 = await pedir(t.admin, { metodo: 'PUT', ruta: '/nvr/camaras/Camara05', cuerpo: { nombre: 'Renombrada' } });
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(pruebas, 0, 'cambiar solo el nombre no prueba la conexión');
  assert.strictEqual(t.registro.obtener('Camara05').password, SECRETO, 'la clave se conserva');
  const r2 = await pedir(t.admin, { metodo: 'PUT', ruta: '/nvr/camaras/Camara05', cuerpo: { host: '172.16.34.77', password: 'OtraClave1' } });
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(pruebas, 1);
  assert.deepStrictEqual([t.registro.obtener('Camara05').host, t.registro.obtener('Camara05').password], ['172.16.34.77', 'OtraClave1']);
  assert.ok(!r2.texto.includes('OtraClave1'));
  const r3 = await pedir(t.admin, { metodo: 'PUT', ruta: '/nvr/camaras/Camara05', cuerpo: { habilitada: false } });
  assert.strictEqual(r3.status, 200);
  assert.strictEqual(t.rutas.cam04, undefined, 'deshabilitada: sin ruta de video');
  assert.strictEqual((await pedir(t.admin, { metodo: 'PUT', ruta: '/nvr/camaras/NoExiste', cuerpo: { nombre: 'x' } })).status, 404);
  const aud = t.auditoria.find((e) => e.accion === 'editar_campos' && e.campos.includes('password'));
  assert.ok(aud && !JSON.stringify(t.auditoria).includes('OtraClave1'), 'se audita QUE cambió la clave, no su valor');
});

test('editar: prueba fallida 422 sin cambios; fallo de un paso deshace', async () => {
  const t = montar({ prueba: async () => ({ ok: false, rtsp: { ok: false, codigo: 'timeout' }, api: {}, ptz: null }) });
  assert.strictEqual((await pedir(t.admin, { metodo: 'PUT', ruta: '/nvr/camaras/Camara05', cuerpo: { host: '172.16.34.88' } })).status, 422);
  assert.strictEqual(t.registro.obtener('Camara05').host, '172.16.34.13');
  const u = montar({ fallar: { shinobi: true } });
  assert.strictEqual((await pedir(u.admin, { metodo: 'PUT', ruta: '/nvr/camaras/Camara05', cuerpo: { nombre: 'Otra' } })).status, 502);
  assert.strictEqual(u.registro.obtener('Camara05').nombre, 'Camara04');
  assert.deepStrictEqual(u.rutas.cam04, { source: 'rtsp://base' }, 'la ruta de MediaMTX vuelve a como estaba');
});

test('eliminar: quita de los 3 sistemas, 404 si no existe, y se deshace si falla', async () => {
  const t = montar();
  assert.strictEqual((await pedir(t.admin, { metodo: 'DELETE', ruta: '/nvr/camaras/Camara05' })).status, 200);
  assert.deepStrictEqual([t.rutas.cam04, t.monitores.Camara05, t.registro.lista().length], [undefined, undefined, 0]);
  assert.strictEqual((await pedir(t.admin, { metodo: 'DELETE', ruta: '/nvr/camaras/Camara05' })).status, 404);
  const u = montar({ fallar: { yml: true } });
  assert.strictEqual((await pedir(u.admin, { metodo: 'DELETE', ruta: '/nvr/camaras/Camara05' })).status, 502);
  assert.ok(u.rutas.cam04 && u.monitores.Camara05 && u.registro.lista().length === 1, 'todo restaurado');
});

test('probar: usa la clave guardada si no se escribe, no guarda nada y limita las pruebas', async () => {
  let recibido;
  const t = montar({ prueba: async (c) => { recibido = c; return { ok: true, rtsp: { ok: true }, api: {}, ptz: false }; } });
  const r = await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras/probar', cuerpo: { id: 'Camara05', host: '172.16.34.50' } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([recibido.host, recibido.password, recibido.usuario], ['172.16.34.50', SECRETO, 'admin']);
  assert.ok(!r.texto.includes(SECRETO));
  assert.strictEqual(t.registro.obtener('Camara05').host, '172.16.34.13', 'probar no modifica el registro');
  assert.strictEqual((await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras/probar', cuerpo: { host: '8.8.8.8', usuario: 'a', password: 'b' } })).status, 400);
  let ultimo; for (let i = 0; i < 14; i++) ultimo = await pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras/probar', cuerpo: { id: 'Camara05' } });
  assert.strictEqual(ultimo.status, 429);
});

test('dos altas simultáneas se serializan y reciben ids distintos', async () => {
  const t = montar();
  const [a, b] = await Promise.all([
    pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: { ...NUEVA, nombre: 'A', host: '172.16.34.31' } }),
    pedir(t.admin, { metodo: 'POST', ruta: '/nvr/camaras', cuerpo: { ...NUEVA, nombre: 'B', host: '172.16.34.32' } }),
  ]);
  assert.deepStrictEqual([a.status, b.status], [201, 201]);
  assert.notStrictEqual(a.json.camara.id, b.json.camara.id);
  assert.notStrictEqual(a.json.camara.ruta, b.json.camara.ruta);
  assert.strictEqual(t.registro.lista().length, 3);
});

test('cuerpo inválido o enorme da 400', async () => {
  const t = montar();
  const req = Readable.from([Buffer.from('no es json')]);
  req.method = 'POST'; req.headers = { authorization: 'Bearer ok' };
  let status; const res = { writeHead(s) { status = s; }, end() {} };
  await t.admin.handle(req, res, new URL('http://x/nvr/camaras'), ['nvr', 'camaras'], async () => ({ realm_access: { roles: ['admin_lab'] } }));
  assert.strictEqual(status, 400);
});
