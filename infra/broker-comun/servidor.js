// servidor.js — servidor HTTP base de los brokers: CORS, registro de peticiones y respuesta por defecto.
//
// Cada servicio solo aporta `manejar(req, res, url, parts) -> true si respondió`. El resto (CORS para el webview del
// cliente Tauri, OPTIONS, 404/405, no morir por una excepción dentro de un manejador) es común.

const http = require('node:http');

/**
 * @param {object} o
 * @param {string} o.nombre   prefijo de log, p. ej. 'camaras'
 * @param {number} o.puerto
 * @param {(req, res, url: URL, parts: string[]) => Promise<boolean>} o.manejar
 * @param {string} [o.host]   solo loopback por defecto: nada se expone directo, todo entra por la puerta de entrada
 */
function crearServidor({ nombre, puerto, manejar, host = '127.0.0.1' }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const parts = url.pathname.split('/').filter(Boolean);
    console.log(`[${nombre}] ${req.method} ${url.pathname}`);

    // CORS: el cliente Tauri (hls.js/fetch en el webview) consulta un host externo; sin estas cabeceras
    // el webview bloquea la respuesta como cross-origin aunque el servicio haya respondido bien.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      if (await manejar(req, res, url, parts)) return;
    } catch (e) {
      // Un manejador que lanza no debe tumbar el proceso ni dejar la petición colgada.
      console.error(`[${nombre}] error no controlado:`, e && e.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error' }));
      } else {
        res.end();
      }
      return;
    }

    res.writeHead(req.method === 'GET' || req.method === 'POST' ? 404 : 405);
    res.end();
  });

  server.listen(puerto, host, () => {
    console.log(`[${nombre}] escuchando en http://${host}:${puerto}`);
  });
  return server;
}

module.exports = { crearServidor };
