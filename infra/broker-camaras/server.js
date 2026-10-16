#!/usr/bin/env node
// broker-camaras — cámaras (Shinobi), PTZ, WebRTC y administración de cámaras. Ver camaras.js, admin.js y README.md.
// Puerto: PORT (8092 por defecto), solo loopback; la puerta de entrada (broker-gateway) lo publica como /nvr/…
//
// Config (env), además de las de camaras.js:
//   SHINOBI_GROUP_KEY  grupo de Shinobi con las cámaras (pilabpiloto)
//   CAMARAS_REGISTRO   archivo del registro de cámaras (/opt/laboremoto-brokers/data/camaras.json); contiene claves, 0600
//   CAMARAS_AUDITORIA  registro de auditoría de cambios (junto al registro, camaras-auditoria.jsonl)
//   MEDIAMTX_API       API de control de MediaMTX (http://127.0.0.1:9997)
//   MEDIAMTX_YML       mediamtx.yml donde se persisten las rutas (/home/pi/camarasMediamtx/mediamtx.yml)
const path = require('node:path');
const { crearServidor } = require('../broker-comun/servidor');
const { configDesdeEnv, crearVerificador } = require('../broker-comun/auth');
const camaras = require('./camaras');
const { Registro, importar } = require('./registro');
const { probar } = require('./sonda');
const mtxLib = require('./mediamtx');
const shiLib = require('./shinobi');
const { crearAdmin, crearAuditoria } = require('./admin');

if (!camaras.SHINOBI_API_KEY) {
  console.error('[camaras] Falta SHINOBI_API_KEY en el entorno');
  process.exit(1);
}

const verifyJwt = crearVerificador(configDesdeEnv());
const archivo = process.env.CAMARAS_REGISTRO || '/opt/laboremoto-brokers/data/camaras.json';
const registro = new Registro({ archivo });
const shinobi = shiLib.crear({ base: `http://127.0.0.1:${process.env.SHINOBI_LOCAL_PORT || 8082}`, key: camaras.SHINOBI_API_KEY, group: process.env.SHINOBI_GROUP_KEY || 'pilabpiloto' });
const mediamtx = mtxLib.crear({ apiUrl: process.env.MEDIAMTX_API || 'http://127.0.0.1:9997', ymlPath: process.env.MEDIAMTX_YML || '/home/pi/camarasMediamtx/mediamtx.yml' });
const auditar = crearAuditoria(process.env.CAMARAS_AUDITORIA || path.join(path.dirname(archivo), 'camaras-auditoria.jsonl'));
const admin = crearAdmin({ registro, probar, mediamtx, shinobi, auditar });

const json = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

/** Primera vez: el registro se arma con lo que ya existe (Shinobi + MediaMTX + mapas de env). Si falla, se sigue con env. */
async function iniciarRegistro() {
  try {
    if (registro.cargar()) { console.log(`[camaras] registro cargado: ${registro.camaras.length} cámaras`); return; }
    const [monitores, rutas] = await Promise.all([shinobi.listar(), mediamtx.configuradas()]);
    const lista = importar({ monitores, mediamtx: rutas, ptz: json(process.env.PTZ_CAMERAS_JSON), webrtc: json(process.env.WEBRTC_PATHS_JSON) });
    if (lista.length) { registro.guardar(lista); console.log(`[camaras] registro creado desde lo existente: ${lista.length} cámaras`); }
    else console.warn('[camaras] no había nada que importar; se usan los mapas de las variables de entorno');
  } catch (e) {
    console.error('[camaras] no se pudo preparar el registro (se usan las variables de entorno):', String(e.message).split(camaras.SHINOBI_API_KEY).join('***'));
  }
}

(async () => {
  await iniciarRegistro();
  camaras.usarRegistro(registro);
  crearServidor({
    nombre: 'camaras',
    puerto: Number(process.env.PORT) || 8092,
    manejar: async (req, res, url, parts) => (await admin.handle(req, res, url, parts, verifyJwt)) || camaras.handle(req, res, url, parts, verifyJwt),
  });
})();
