// shinobi.js — adaptador de Shinobi (NVR): crea, actualiza y elimina monitores por su API.
//
// Un monitor nuevo se arma clonando uno existente (los ~200 ajustes de Shinobi se heredan) y cambiando solo lo propio de la
// cámara. Los errores nunca llevan la API key.
//
// Config: SHINOBI_API_KEY, SHINOBI_LOCAL_PORT (8082) y el grupo (pilabpiloto).

const { urlRtsp } = require('./sonda');

function crear({ base = 'http://127.0.0.1:8082', key, group = 'pilabpiloto', fetchFn = globalThis.fetch }) {
  const limpio = (e) => new Error(String(e && e.message ? e.message : e).split(key).join('***'));
  const url = (ruta) => `${base}/${key}${ruta}`;

  async function pedir(ruta, opciones) {
    try {
      const r = await fetchFn(url(ruta), opciones);
      return await r.json();
    } catch (e) { throw limpio(e); }
  }

  return {
    async listar() {
      const r = await pedir(`/monitor/${group}`);
      if (!Array.isArray(r)) throw new Error('Shinobi no devolvió la lista de monitores');
      return r;
    },

    async obtener(mid) {
      const r = await pedir(`/monitor/${group}/${encodeURIComponent(mid)}`);
      const m = Array.isArray(r) ? r[0] : r;
      return m && m.mid === mid ? m : null;
    },

    /**
     * Crea o actualiza el monitor de `cam`. `plantilla`: monitor existente a clonar (obligatorio si el monitor no existe).
     * Devuelve el monitor anterior (null si era nuevo), para poder deshacer.
     */
    async guardar(cam, plantilla) {
      const anterior = await this.obtener(cam.id);
      const origen = anterior || plantilla;
      if (!origen) throw new Error('No hay un monitor de Shinobi que sirva de plantilla');
      const m = JSON.parse(JSON.stringify(origen));
      const d = typeof m.details === 'string' ? JSON.parse(m.details) : (m.details || {});
      d.muser = cam.usuario; d.mpass = cam.password; d.auto_host = urlRtsp(cam); d.auto_host_enable = 1;
      m.details = JSON.stringify(d);
      m.mid = cam.id; m.name = cam.nombre; m.host = cam.host; m.port = cam.puerto; m.protocol = m.protocol || 'rtsp';
      m.mode = cam.habilitada ? 'start' : 'stop';
      if (typeof m.path === 'string' && m.path.includes('@')) m.path = m.path.replace(/\/\/[^@]*@[^/]*/, `//${encodeURIComponent(cam.usuario)}:${encodeURIComponent(cam.password)}@${cam.host}:${cam.puerto}`);
      delete m.status;
      const r = await pedir(`/configureMonitor/${group}/${encodeURIComponent(cam.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: JSON.stringify(m) }),
      });
      if (!r || r.ok !== true) throw new Error(`Shinobi no aceptó el monitor${r && r.msg ? `: ${r.msg}` : ''}`);
      return anterior;
    },

    async eliminar(mid) {
      const anterior = await this.obtener(mid);
      if (!anterior) return null;
      const r = await pedir(`/configureMonitor/${group}/${encodeURIComponent(mid)}/delete`);
      if (!r || r.ok !== true) throw new Error(`Shinobi no pudo eliminar el monitor${r && r.msg ? `: ${r.msg}` : ''}`);
      return anterior;
    },

    /** Vuelve a dejar un monitor como estaba (para deshacer). */
    async restaurar(mid, anterior) {
      if (!anterior) { await this.eliminar(mid); return; }
      const m = JSON.parse(JSON.stringify(anterior));
      delete m.status;
      const r = await pedir(`/configureMonitor/${group}/${encodeURIComponent(mid)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: JSON.stringify(m) }),
      });
      if (!r || r.ok !== true) throw new Error('Shinobi no pudo restaurar el monitor');
    },
  };
}

module.exports = { crear };
