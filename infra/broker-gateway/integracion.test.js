// Prueba de punta a punta: los 4 servicios reales (gateway, camaras, sesiones, moodle) con un Shinobi, un Moodle y un
// JWKS falsos. Comprueba que a través de la puerta de entrada se comportan como el antiguo broker único y que la
// caída de un servicio no tumba a los demás. Ejecutar: node --test infra/broker-gateway/integracion.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');
const ISSUER = 'http://kc.test/realms/lab';
const API_KEY = 'CLAVE-SECRETA-SHINOBI';

const hijos = [];
const servidores = [];
let g; // contexto

const b64u = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function puertoLibre() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function levantar(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => { servidores.push(s); resolve(s); });
  });
}

function esperarPuerto(puerto, ms = 8000) {
  const limite = Date.now() + ms;
  return new Promise((resolve, reject) => {
    (function intentar() {
      const c = net.connect(puerto, '127.0.0.1');
      c.on('connect', () => { c.destroy(); resolve(); });
      c.on('error', () => { c.destroy(); Date.now() > limite ? reject(new Error('puerto ' + puerto + ' no abrió')) : setTimeout(intentar, 80); });
    })();
  });
}

function arrancar(script, env) {
  const p = spawn(process.execPath, [path.join(RAIZ, script)], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.resume(); p.stderr.resume();
  hijos.push(p);
  return p;
}

function pedir(metodo, ruta, { token, cuerpo, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = cuerpo === undefined ? null : JSON.stringify(cuerpo);
    const req = http.request({
      host: '127.0.0.1', port: g.puertoGateway, path: ruta, method: metodo,
      headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers },
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch { /* texto */ } resolve({ status: res.statusCode, headers: res.headers, texto: b, json }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}

function jwt(priv, { usuario = 'est@x', roles = [] } = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 600, preferred_username: usuario, name: 'Nombre ' + usuario, realm_access: { roles } }));
  return `${h}.${p}.${b64u(crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), priv))}`;
}

test.before(async () => {
  const par = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...par.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const jwks = await levantar((req, res) => res.end(JSON.stringify({ keys: [jwk] })));

  // Shinobi falso: monitores con estado (lista, consulta, alta/edición y baja), manifest con la clave embebida y un segmento.
  const monitores = {
    Camara1: { mid: 'Camara1', name: 'c1', host: '172.16.34.9', port: 554, mode: 'start', status: 'Watching', details: JSON.stringify({ muser: 'admin', mpass: 'ClaveCam1', ajuste: 1 }), streams: [`/${API_KEY}/hls/grp/Camara1/s.m3u8`] },
    Camara2: { mid: 'Camara2', name: 'c2', host: '172.16.34.10', port: 554, mode: 'start', details: '{}', streams: [] },
  };
  const shinobi = await levantar((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const p = req.url.split('?')[0];
      const m1 = /^\/([^/]+)\/monitor\/grp\/([^/]+)$/.exec(p);
      const cfg = /^\/([^/]+)\/configureMonitor\/grp\/([^/]+)(\/delete)?$/.exec(p);
      if (p === `/${API_KEY}/monitor/grp`) return res.end(JSON.stringify(Object.values(monitores)));
      if (m1 && m1[1] === API_KEY) return res.end(JSON.stringify(monitores[m1[2]] ? [monitores[m1[2]]] : []));
      if (cfg && cfg[1] === API_KEY) {
        if (cfg[3]) { delete monitores[cfg[2]]; return res.end(JSON.stringify({ ok: true })); }
        const d = JSON.parse(new URLSearchParams(cuerpo).get('data'));
        monitores[d.mid] = { ...d, streams: [] };
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.url === `/${API_KEY}/hls/grp/Camara1/s.m3u8`) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.end(`#EXTM3U\n/${API_KEY}/hls/grp/Camara1/seg0.ts\n`);
      }
      if (req.url === `/${API_KEY}/hls/grp/Camara1/seg0.ts`) { res.setHeader('Content-Type', 'video/mp2t'); return res.end(Buffer.from([1, 2, 3, 4])); }
      res.statusCode = 404; res.end('no');
    });
  });

  // MediaMTX falso (API de control): rutas configuradas y estado.
  const rutasMtx = { cam00: { source: 'rtsp://admin:ClaveCam1@172.16.34.9:554/h264Preview_01_sub' } };
  const mediamtxFalso = await levantar((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const p = req.url.split('?')[0];
      const json = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      const n = decodeURIComponent(p.split('/').pop());
      if (p === '/v3/config/paths/list') return json(200, { items: Object.entries(rutasMtx).map(([name, c]) => ({ name, source: c.source })) });
      if (p === '/v3/paths/list') return json(200, { items: Object.keys(rutasMtx).map((name) => ({ name, ready: true, readers: [] })) });
      if (p.startsWith('/v3/config/paths/get/')) return rutasMtx[n] ? json(200, { name: n, ...rutasMtx[n] }) : json(404, { error: 'no' });
      if (p.startsWith('/v3/config/paths/add/') || p.startsWith('/v3/config/paths/replace/')) { rutasMtx[n] = JSON.parse(cuerpo); return json(200, {}); }
      if (p.startsWith('/v3/config/paths/delete/')) { delete rutasMtx[n]; return json(200, {}); }
      return json(404, {});
    });
  });

  // Moodle falso: solo sabe responder la búsqueda de usuarios (nadie existe).
  const moodleFalso = await levantar((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const fn = new URLSearchParams(b).get('wsfunction');
      res.setHeader('Content-Type', 'application/json');
      res.end(fn === 'core_user_get_users_by_field' ? '[]' : JSON.stringify({ exception: 'x', message: 'no simulada', errorcode: 'nf' }));
    });
  });

  const [pCam, pSes, pMoo, pGw] = await Promise.all([puertoLibre(), puertoLibre(), puertoLibre(), puertoLibre()]);
  const keycloak = { KEYCLOAK_JWKS_URL: `http://127.0.0.1:${jwks.address().port}/certs`, KEYCLOAK_ISSUER: ISSUER };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brokers-'));
  const ymlMtx = path.join(tmp, 'mediamtx.yml');
  fs.writeFileSync(ymlMtx, 'api: yes\nwebrtc: yes\n\npaths:\n  cam00:\n    source: "rtsp://admin:ClaveCam1@172.16.34.9:554/h264Preview_01_sub"\n');

  arrancar('broker-camaras/server.js', {
    ...keycloak, PORT: pCam, SHINOBI_API_KEY: API_KEY, SHINOBI_LOCAL_PORT: shinobi.address().port, SHINOBI_GROUP_KEY: 'grp',
    PTZ_CAMERAS_JSON: JSON.stringify({ Camara1: { host: '127.0.0.1', user: 'u', pass: 'p' } }),
    WEBRTC_PATHS_JSON: JSON.stringify({ Camara1: 'cam00' }),
    CAMARAS_REGISTRO: path.join(tmp, 'data', 'camaras.json'), MEDIAMTX_API: `http://127.0.0.1:${mediamtxFalso.address().port}`, MEDIAMTX_YML: ymlMtx,
  });
  arrancar('broker-sesiones/server.js', {
    ...keycloak, PORT: pSes, SESIONES_FILE: path.join(tmp, 'sesiones.jsonl'),
    DISPOSITIVOS_JSON: JSON.stringify({ pi4: { nombre: 'Pi4', token: 'token-del-agente' } }), DISPOSITIVOS_FILE: path.join(tmp, 'dispositivos.jsonl'),
  });
  const moodle = arrancar('broker-moodle/server.js', {
    ...keycloak, PORT: pMoo, MOODLE_URL: `http://127.0.0.1:${moodleFalso.address().port}`, MOODLE_TOKEN: 'tok', MOODLE_HOST_HEADER: 'localhost:8080',
  });
  arrancar('broker-gateway/server.js', {
    PORT: pGw, UPSTREAM_CAMARAS: `http://127.0.0.1:${pCam}`, UPSTREAM_SESIONES: `http://127.0.0.1:${pSes}`, UPSTREAM_MOODLE: `http://127.0.0.1:${pMoo}`,
  });
  await Promise.all([pCam, pSes, pMoo, pGw].map((p) => esperarPuerto(p)));
  g = { puertoGateway: pGw, puertoSesiones: pSes, priv: par.privateKey, moodle, tmp, monitores, rutasMtx, ymlMtx };
});

test.after(() => {
  for (const h of hijos) h.kill();
  for (const s of servidores) s.close();
});

test('cámaras: /nvr/monitor exige token y no filtra la clave de Shinobi', async () => {
  assert.strictEqual((await pedir('GET', '/nvr/monitor/grp')).status, 401);
  const r = await pedir('GET', '/nvr/monitor/grp', { token: jwt(g.priv) });
  assert.strictEqual(r.status, 200);
  assert.doesNotMatch(r.texto, new RegExp(API_KEY));
  const c1 = r.json.find((m) => m.mid === 'Camara1');
  assert.match(c1.streams[0], /^\/nvr\/hls\/[0-9a-f]{48}\/hls\/grp\/Camara1\/s\.m3u8$/);
  assert.strictEqual(c1.ptz, true);
  assert.strictEqual(c1.webrtc, 'cam00');
  assert.strictEqual(r.json.find((m) => m.mid === 'Camara2').ptz, false);
  // La sesión se reutiliza entre consultas (si no, el reproductor se reiniciaría cada 5 s).
  const r2 = await pedir('GET', '/nvr/monitor/grp', { token: jwt(g.priv) });
  assert.strictEqual(r2.json[0].streams[0], c1.streams[0]);
});

test('cámaras: HLS por la sesión opaca, con el manifest reescrito', async () => {
  const lista = await pedir('GET', '/nvr/monitor/grp', { token: jwt(g.priv) });
  const ruta = lista.json[0].streams[0];
  const m = await pedir('GET', ruta);
  assert.strictEqual(m.status, 200);
  assert.doesNotMatch(m.texto, new RegExp(API_KEY));
  assert.match(m.texto, /\/nvr\/hls\/[0-9a-f]{48}\/hls\/grp\/Camara1\/seg0\.ts/);
  const seg = await pedir('GET', ruta.replace('s.m3u8', 'seg0.ts'));
  assert.strictEqual(seg.status, 200);
  assert.strictEqual(seg.headers['content-type'], 'video/mp2t');
  assert.strictEqual((await pedir('GET', '/nvr/hls/sesion-falsa/hls/grp/Camara1/s.m3u8')).status, 401);
});

test('cámaras: PTZ solo para personal, y cámara/operación inválidas se rechazan', async () => {
  assert.strictEqual((await pedir('POST', '/nvr/ptz/grp/Camara1', { token: jwt(g.priv), cuerpo: { op: 'Left' } })).status, 403);
  const staff = jwt(g.priv, { usuario: 'lab@x', roles: ['laboratorista'] });
  assert.strictEqual((await pedir('POST', '/nvr/ptz/grp/NoExiste', { token: staff, cuerpo: { op: 'Left' } })).json.error, 'ptz_not_supported');
  assert.strictEqual((await pedir('POST', '/nvr/ptz/grp/Camara1', { token: staff, cuerpo: { op: 'Volar' } })).json.error, 'invalid_op');
});

test('cámaras: WebRTC solo con token y solo para rutas listadas', async () => {
  assert.strictEqual((await pedir('POST', '/nvr/whep/cam00')).status, 401);
});

test('sesiones: registra un inicio, conserva la IP reenviada y el resumen exige rol', async () => {
  const est = jwt(g.priv, { usuario: 'ana@x' });
  const ev = await pedir('POST', '/nvr/sesiones/evento', {
    token: est, headers: { 'x-forwarded-for': '10.9.8.7' }, cuerpo: { tipo: 'inicio', sesion_id: 'sesion-1', practica_id: 'linux', practica_nombre: 'Linux' },
  });
  assert.strictEqual(ev.status, 201); // sesión nueva (un reintento del mismo inicio responde 200)
  assert.strictEqual((await pedir('GET', '/nvr/sesiones/resumen', { token: est })).status, 403);
  const adm = jwt(g.priv, { usuario: 'admin@x', roles: ['admin_lab'] });
  const res = await pedir('GET', '/nvr/sesiones/resumen?dias=1', { token: adm });
  assert.strictEqual(res.status, 200);
  const s = res.json.sesiones.find((x) => x.sesion_id === 'sesion-1');
  assert.strictEqual(s.usuario, 'ana@x');
  assert.strictEqual(s.ip, '10.9.8.7');
});

test('moodle: exige token y habla con Moodle', async () => {
  assert.strictEqual((await pedir('GET', '/nvr/moodle/cursos')).status, 401);
  const r = await pedir('GET', '/nvr/moodle/cursos', { token: jwt(g.priv, { usuario: 'ana@x' }) });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json, { enMoodle: false, cursos: [] });
});

test('rutas desconocidas dan 404 y OPTIONS responde CORS', async () => {
  assert.strictEqual((await pedir('GET', '/nvr/nada')).status, 404);
  assert.strictEqual((await pedir('GET', '/otra/cosa')).status, 404);
  const o = await pedir('OPTIONS', '/nvr/monitor/grp');
  assert.strictEqual(o.status, 204);
  assert.strictEqual(o.headers['access-control-allow-origin'], '*');
});

test('administración de cámaras por el gateway: solo admin_lab; crear, editar y eliminar se reflejan en Shinobi, MediaMTX, yml y registro', async () => {
  const admin = jwt(g.priv, { usuario: 'admin@x', roles: ['admin_lab'] });
  const lab = jwt(g.priv, { usuario: 'lab@x', roles: ['laboratorista'] });
  // acceso
  assert.strictEqual((await pedir('GET', '/nvr/camaras')).status, 401);
  assert.strictEqual((await pedir('GET', '/nvr/camaras', { token: lab })).status, 403);
  assert.strictEqual((await pedir('POST', '/nvr/camaras', { token: lab, cuerpo: { nombre: 'x' } })).status, 403);
  // el registro se armó solo con lo que ya existía (Camara1 con su ruta de MediaMTX), y no expone claves
  const l0 = await pedir('GET', '/nvr/camaras', { token: admin });
  assert.strictEqual(l0.status, 200);
  assert.deepStrictEqual(l0.json.camaras.map((c) => [c.id, c.ruta, c.estado, c.video]), [['Camara1', 'cam00', 'active', 'transmitiendo']]);
  assert.doesNotMatch(l0.texto, /ClaveCam1/);
  // validación y red privada
  assert.strictEqual((await pedir('POST', '/nvr/camaras', { token: admin, cuerpo: { nombre: 'Mala', host: '8.8.8.8', usuario: 'a', password: 'b' } })).status, 400);
  // alta (forzar: no hay cámara real que probar en este entorno)
  const alta = await pedir('POST', '/nvr/camaras', { token: admin, cuerpo: { nombre: 'Aula 2', host: '172.16.34.20', usuario: 'admin', password: 'ClaveNueva#1', ptz: true, forzar: true } });
  assert.strictEqual(alta.status, 201);
  assert.doesNotMatch(alta.texto, /ClaveNueva/);
  const id = alta.json.camara.id; const ruta = alta.json.camara.ruta;
  assert.deepStrictEqual([id, ruta], ['Camara02', 'cam01']);
  assert.match(JSON.parse(g.monitores[id].details).mpass, /ClaveNueva#1/);                         // Shinobi con la clave
  assert.match(g.rutasMtx[ruta].source, /^rtsp:\/\/admin:ClaveNueva%231@172\.16\.34\.20:554\//);    // MediaMTX en caliente (clave codificada)
  assert.ok(fs.readFileSync(g.ymlMtx, 'utf8').includes(`  ${ruta}:\n    source: "rtsp://admin:ClaveNueva%231@`)); // y persistido en el yml
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(g.tmp, 'data', 'camaras.json'), 'utf8')).camaras.length, 2);
  // sin reiniciar: la grilla ya la ve con PTZ y WebRTC
  const grilla = await pedir('GET', '/nvr/monitor/grp', { token: jwt(g.priv) });
  const nueva = grilla.json.find((m) => m.mid === id);
  assert.deepStrictEqual([nueva.ptz, nueva.webrtc], [true, ruta]);
  // edición: renombrar conserva la clave; deshabilitar quita el video
  const ed = await pedir('PUT', `/nvr/camaras/${id}`, { token: admin, cuerpo: { nombre: 'Aula 2 (norte)' } });
  assert.strictEqual(ed.status, 200);
  assert.strictEqual(g.monitores[id].name, 'Aula 2 (norte)');
  assert.match(JSON.parse(g.monitores[id].details).mpass, /ClaveNueva#1/, 'la clave se conserva');
  await pedir('PUT', `/nvr/camaras/${id}`, { token: admin, cuerpo: { habilitada: false } });
  assert.strictEqual(g.rutasMtx[ruta], undefined);
  assert.strictEqual(g.monitores[id].mode, 'stop');
  assert.strictEqual((await pedir('GET', '/nvr/monitor/grp', { token: jwt(g.priv) })).json.find((m) => m.mid === id).webrtc, null);
  // baja
  assert.strictEqual((await pedir('DELETE', `/nvr/camaras/${id}`, { token: admin })).status, 200);
  assert.deepStrictEqual([g.monitores[id], g.rutasMtx[ruta]], [undefined, undefined]);
  assert.ok(!fs.readFileSync(g.ymlMtx, 'utf8').includes(`  ${ruta}:`));
  assert.strictEqual((await pedir('DELETE', `/nvr/camaras/${id}`, { token: admin })).status, 404);
  // auditoría: quién y qué, nunca claves
  const aud = fs.readFileSync(path.join(g.tmp, 'data', 'camaras-auditoria.jsonl'), 'utf8');
  assert.match(aud, /"usuario":"admin@x"/);
  assert.doesNotMatch(aud, /ClaveNueva|ClaveCam1/);
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(path.join(g.tmp, 'data', 'camaras.json')).mode & 0o777, 0o600);
});

test('dispositivos: el agente reporta en local, internet solo puede CONSULTAR (con rol) y no puede inyectar eventos', async () => {
  const evento = (cuerpo, token = 'token-del-agente') => new Promise((resolve, reject) => {
    const data = JSON.stringify(cuerpo);
    const req = http.request({ host: '127.0.0.1', port: g.puertoSesiones, path: '/nvr/dispositivos/evento', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-dispositivo-token': token } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(data);
  });
  const admin = jwt(g.priv, { usuario: 'admin@x', roles: ['admin_lab'] });
  // por la puerta de entrada (internet) la ruta de eventos NO existe, ni siquiera con el token correcto
  const porInternet = await pedir('POST', '/nvr/dispositivos/evento', { cuerpo: { dispositivo: 'pi4', tipo: 'latido' }, headers: { 'x-dispositivo-token': 'token-del-agente' } });
  assert.strictEqual(porInternet.status, 404);
  // el agente, en local, con su token
  assert.strictEqual(await evento({ dispositivo: 'pi4', tipo: 'entrada', sesion: '4242', usuario: 'UPILOTO\\\\ana-perez', ip: '10.1.2.3' }), 201);
  assert.strictEqual(await evento({ dispositivo: 'pi4', tipo: 'latido', abiertas: ['4242'] }), 200);
  assert.strictEqual(await evento({ dispositivo: 'pi4', tipo: 'latido' }, 'token-falso'), 403);
  // la consulta por internet exige JWT y rol de supervisión
  assert.strictEqual((await pedir('GET', '/nvr/dispositivos/resumen')).status, 401);
  assert.strictEqual((await pedir('GET', '/nvr/dispositivos/resumen', { token: jwt(g.priv, { roles: ['estudiante'] }) })).status, 403);
  // la app avisa dónde está (sin práctica abierta): esa ubicación pasa a la conexión SSH de la misma IP
  const persona = jwt(g.priv, { usuario: 'ana-perez' });
  assert.strictEqual((await pedir('POST', '/nvr/sesiones/ubicacion-app', { cuerpo: { lat: 4.65, lon: -74.06 } })).status, 401);
  assert.strictEqual((await pedir('POST', '/nvr/sesiones/ubicacion-app', { token: persona, cuerpo: { lat: 'x', lon: 1 } })).status, 400);
  assert.strictEqual((await pedir('POST', '/nvr/sesiones/ubicacion-app', { token: persona, headers: { 'x-forwarded-for': '10.1.2.3' }, cuerpo: { lat: 4.65, lon: -74.06, precision_m: 25 } })).status, 200);
  const r = await pedir('GET', '/nvr/dispositivos/resumen?dias=7', { token: admin });
  assert.strictEqual(r.status, 200);
  const pi4 = r.json.dispositivos[0];
  assert.deepStrictEqual([r.json.dispositivos[0].conectados[0].lat, r.json.dispositivos[0].conectados[0].lon], [4.65, -74.06]);
  assert.deepStrictEqual([pi4.id, pi4.enLinea, pi4.conectados.map((c) => c.usuario)], ['pi4', true, ['UPILOTO\\ana-perez']]);
  assert.doesNotMatch(r.texto, /token-del-agente/);
  // y las prácticas siguen funcionando junto a esto
  assert.strictEqual((await pedir('GET', '/nvr/sesiones/resumen', { token: admin })).status, 200);
});

test('si el servicio de Moodle se cae, solo falla Moodle: cámaras y sesiones siguen', async () => {
  g.moodle.kill();
  await new Promise((r) => g.moodle.once('exit', r));
  const caido = await pedir('GET', '/nvr/moodle/cursos', { token: jwt(g.priv) });
  assert.strictEqual(caido.status, 503);
  assert.strictEqual(caido.json.error, 'servicio_no_disponible');
  assert.strictEqual(caido.json.servicio, 'moodle');
  assert.strictEqual((await pedir('GET', '/nvr/monitor/grp', { token: jwt(g.priv) })).status, 200);
  assert.strictEqual((await pedir('GET', '/nvr/sesiones/resumen', { token: jwt(g.priv, { roles: ['admin_lab'] }) })).status, 200);
});
