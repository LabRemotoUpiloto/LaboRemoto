// mediamtx.js — adaptador de MediaMTX (video por WebRTC).
//
// Los cambios se aplican EN CALIENTE con la API de control (:9997), sin reiniciar y sin cortar el video de las demás
// cámaras, y además se escriben en mediamtx.yml (la API no guarda en disco) para que sobrevivan a un reinicio.
//
// Config (env): MEDIAMTX_API (http://127.0.0.1:9997), MEDIAMTX_YML (/home/pi/camarasMediamtx/mediamtx.yml).

const fs = require('node:fs');
const path = require('node:path');
const { urlRtsp } = require('./sonda');

const MAX_RESPALDOS = 10;

function sourceDe(c) { return urlRtsp(c); }

/** Texto de la sección `paths:` generada desde el registro (solo cámaras habilitadas). */
function seccionPaths(camaras) {
  const filas = camaras.filter((c) => c.habilitada).map((c) => `  ${c.ruta}:\n    source: ${JSON.stringify(sourceDe(c))}\n`);
  return `paths:\n${filas.join('')}`;
}

function crear({ apiUrl = 'http://127.0.0.1:9997', ymlPath, fetchFn = globalThis.fetch, ahora = () => new Date() }) {
  async function api(metodo, ruta, cuerpo) {
    const r = await fetchFn(`${apiUrl}${ruta}`, {
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch { /* sin cuerpo */ }
    return { status: r.status, json };
  }
  const nombre = (ruta) => encodeURIComponent(ruta);

  return {
    /** { ruta: { listo, lectores } } de las rutas activas. */
    async estado() {
      const { status, json } = await api('GET', '/v3/paths/list');
      if (status !== 200) throw new Error(`MediaMTX respondió ${status}`);
      return Object.fromEntries((json.items || []).map((i) => [i.name, { listo: Boolean(i.ready), lectores: (i.readers || []).length }]));
    },

    /** Rutas de la configuración con su origen ya desglosado (sirve para armar el registro la primera vez). */
    async configuradas() {
      const { status, json } = await api('GET', '/v3/config/paths/list');
      if (status !== 200) throw new Error(`MediaMTX respondió ${status}`);
      return (json.items || []).map((i) => {
        const m = /^rtsp:\/\/([^:]*):([^@]*)@([^:/]+):(\d+)(\/.*)?$/.exec(i.source || '');
        return m ? { ruta: i.name, user: decodeURIComponent(m[1]), pass: decodeURIComponent(m[2]), host: m[3], path: m[5] || '' } : null;
      }).filter(Boolean);
    },

    /** Configuración actual de una ruta, o null si no existe (sirve para deshacer). */
    async obtener(ruta) {
      const { status, json } = await api('GET', `/v3/config/paths/get/${nombre(ruta)}`);
      if (status === 404) return null;
      if (status !== 200) throw new Error(`MediaMTX respondió ${status}`);
      return json;
    },

    /** Crea la ruta o reemplaza su origen. Devuelve la configuración anterior (null si era nueva). */
    async aplicar(ruta, source) {
      const anterior = await this.obtener(ruta);
      const { status } = await api('POST', `/v3/config/paths/${anterior ? 'replace' : 'add'}/${nombre(ruta)}`, { source });
      if (status !== 200) throw new Error(`MediaMTX no pudo ${anterior ? 'actualizar' : 'crear'} la ruta (${status})`);
      return anterior;
    },

    async quitar(ruta) {
      const anterior = await this.obtener(ruta);
      if (!anterior) return null;
      const { status } = await api('DELETE', `/v3/config/paths/delete/${nombre(ruta)}`);
      if (status !== 200) throw new Error(`MediaMTX no pudo quitar la ruta (${status})`);
      return anterior;
    },

    /** Deshace un `aplicar`/`quitar`: vuelve a la configuración anterior (null = que no exista). */
    async restaurar(ruta, anterior) {
      if (anterior) {
        const existe = await this.obtener(ruta);
        const { status } = await api('POST', `/v3/config/paths/${existe ? 'replace' : 'add'}/${nombre(ruta)}`, { source: anterior.source });
        if (status !== 200) throw new Error(`MediaMTX no pudo restaurar la ruta (${status})`);
      } else {
        await this.quitar(ruta);
      }
    },

    /** Reescribe la sección `paths:` de mediamtx.yml (atómico, con respaldo). El resto del archivo no se toca. */
    persistir(camaras) {
      if (!ymlPath) return;
      const actual = fs.readFileSync(ymlPath, 'utf8');
      const i = actual.search(/^paths:/m);
      const antes = i === -1 ? actual.replace(/\n*$/, '\n\n') : actual.slice(0, i);
      const nuevo = antes + '# Sección generada por broker-camaras (Administrar cámaras): no editar a mano, se sobrescribe.\n' + seccionPaths(camaras);
      const dir = path.dirname(ymlPath);
      const sello = ahora().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      fs.copyFileSync(ymlPath, `${ymlPath}.bak-admin-${sello}`);
      const base = path.basename(ymlPath);
      const viejos = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.bak-admin-`)).sort();
      for (const f of viejos.slice(0, Math.max(0, viejos.length - MAX_RESPALDOS))) fs.rmSync(path.join(dir, f), { force: true });
      const tmp = `${ymlPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, nuevo);
      fs.renameSync(tmp, ymlPath);
    },
  };
}

module.exports = { crear, sourceDe, seccionPaths };
