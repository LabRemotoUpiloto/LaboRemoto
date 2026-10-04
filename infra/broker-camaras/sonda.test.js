// Pruebas de la sonda: el video y la API de la cámara se prueban A LA VEZ (antes eran una tras otra y «Probar conexión»
// tardaba la suma; con el flujo de alta resolución pasaba de 8 s y la app daba un error de algo que sí se aplicaba).
// Ejecutar: node --test infra/broker-camaras/sonda.test.js
const test = require('node:test');
const assert = require('node:assert');
const { probar } = require('./sonda');

const cam = { host: '172.16.34.9', puerto: 554, usuario: 'admin', password: 'x', rtspPath: '/h264Preview_01_main' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const video = JSON.stringify({ streams: [{ codec_name: 'h264', width: 2880, height: 1616 }] });

test('el video y la API se prueban en paralelo: el total es el del más lento, no la suma', async () => {
  const reolink = async (h, ruta) => {
    await espera(150);
    if (ruta.includes('Login')) return [{ value: { Token: { name: 'T' } } }];
    if (ruta.includes('GetDevInfo')) return [{ value: { DevInfo: { model: 'E1 Pro' } } }];
    return [{ code: 0 }];
  };
  const t0 = Date.now();
  const r = await probar(cam, { ffprobe: async () => { await espera(300); return { codigo: 0, stdout: video, stderr: '' }; }, reolink });
  const total = Date.now() - t0;
  assert.deepStrictEqual([r.ok, r.rtsp.video.alto, r.api.modelo, r.ptz], [true, 1616, 'E1 Pro', true]);
  // En serie serían ≥ 300 + 150 (login) + 150 (info y ptz a la vez) = 600 ms; en paralelo ≈ 300 ms.
  assert.ok(total < 520, `tardó ${total} ms: parece que se prueban en serie`);
});

test('si falla la API pero el video funciona, la cámara es válida y no se inventa el PTZ', async () => {
  const r = await probar(cam, { ffprobe: async () => ({ codigo: 0, stdout: video, stderr: '' }), reolink: async () => { throw new Error('sin api'); } });
  assert.deepStrictEqual([r.ok, r.api.ok, r.ptz], [true, false, null]);
});

test('si el PTZ falla pero la API responde, el PTZ es falso y el modelo se conserva', async () => {
  const reolink = async (h, ruta) => {
    if (ruta.includes('Login')) return [{ value: { Token: { name: 'T' } } }];
    if (ruta.includes('GetDevInfo')) return [{ value: { DevInfo: { model: 'RLC' } } }];
    throw new Error('sin ptz');
  };
  const r = await probar(cam, { ffprobe: async () => ({ codigo: 0, stdout: video, stderr: '' }), reolink });
  assert.deepStrictEqual([r.api.ok, r.api.modelo, r.ptz], [true, 'RLC', false]);
});

test('video fallido: ok=false con el motivo, aunque la API sí responda', async () => {
  const reolink = async (h, ruta) => (ruta.includes('Login') ? [{ value: { Token: { name: 'T' } } }] : [{ code: 0, value: { DevInfo: {} } }]);
  const r = await probar(cam, { ffprobe: async () => ({ codigo: 1, stdout: '', stderr: '401 Unauthorized' }), reolink });
  assert.deepStrictEqual([r.ok, r.rtsp.codigo, r.api.ok], [false, 'clave', true]);
});
