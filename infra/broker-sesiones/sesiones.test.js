// Pruebas del registro de sesiones (prácticas y uso de la app). Ejecutar: node --test infra/broker-sesiones/sesiones.test.js
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

// El módulo lee su configuración al cargarse: archivo temporal y sin webhook.
process.env.SESIONES_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ses-')), 'sesiones.jsonl');
process.env.SESIONES_WEBHOOK_URL = '';
const { handle } = require('./sesiones');

const ADMIN = { preferred_username: 'admin', name: 'Admin', realm_access: { roles: ['admin_lab'] } };
const ANA = { preferred_username: 'ana-perez', name: 'Ana Pérez', email: 'ana@upc.edu.co', realm_access: { roles: [] } };

/** Una petición al módulo, con la identidad ya validada (`claims`). IP privada: no se consulta la geolocalización. */
async function pedir(method, ruta, cuerpo, claims) {
  const req = Readable.from(cuerpo ? [JSON.stringify(cuerpo)] : []);
  Object.assign(req, { method, headers: { authorization: 'Bearer x' }, socket: { remoteAddress: '10.0.0.7' } });
  const res = { status: 0, body: '', headersSent: false,
    writeHead(s) { this.status = s; this.headersSent = true; }, end(b) { this.body = b || ''; } };
  const url = new URL(`http://broker${ruta}`);
  await handle(req, res, url, url.pathname.split('/').filter(Boolean), async () => claims);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

const sesionesDe = async () => (await pedir('GET', '/nvr/sesiones/resumen?dias=1', null, ADMIN)).json.sesiones;

test('el uso de la app queda registrado con clase «app» y sin práctica', async () => {
  assert.equal((await pedir('POST', '/nvr/sesiones/app', { tipo: 'inicio', sesion_id: 'app-1', practica_id: 'linux' }, ANA)).status, 201);
  const s = (await sesionesDe()).find((x) => x.sesion_id === 'app-1');
  assert.equal(s.clase, 'app');
  assert.equal(s.practica_id, null);
  assert.equal(s.usuario, 'ana-perez');
  assert.equal((await pedir('POST', '/nvr/sesiones/app', { tipo: 'fin', sesion_id: 'app-1' }, ANA)).status, 200);
  assert.ok((await sesionesDe()).find((x) => x.sesion_id === 'app-1').fin);
});

test('una práctica sigue entrando por /evento con clase «practica»', async () => {
  await pedir('POST', '/nvr/sesiones/evento', { tipo: 'inicio', sesion_id: 'ssh-9', practica_id: 'linux', practica_nombre: 'Linux' }, ANA);
  const s = (await sesionesDe()).find((x) => x.sesion_id === 'ssh-9');
  assert.equal(s.clase, 'practica');
  assert.equal(s.practica_id, 'linux');
});

test('la app no acepta eventos de ubicación ni sesiones que no empezó', async () => {
  assert.equal((await pedir('POST', '/nvr/sesiones/app', { tipo: 'ubicacion', sesion_id: 'app-2', lat: 4.6, lon: -74 }, ANA)).status, 400);
  assert.equal((await pedir('POST', '/nvr/sesiones/app', { tipo: 'latido', sesion_id: 'app-nunca' }, ANA)).status, 404);
});

test('el resumen sigue siendo solo para supervisión', async () => {
  assert.equal((await pedir('GET', '/nvr/sesiones/resumen?dias=1', null, ANA)).status, 403);
});
