// Genera las capturas del README abriendo la interfaz en un navegador (Playwright) con un Tauri SIMULADO.
//
//   1. Arranca el frontend:  npm run dev:frontend   (o `npx vite --port 5199 --strictPort`)
//   2. En otra terminal:     node scripts/capturas.mjs [URL] [carpeta-de-salida]
//
// Las capturas muestran la interfaz REAL pero con DATOS DE DEMOSTRACIÓN (ver `demo` más abajo): no se conecta
// a ningún equipo, a Keycloak ni a los brokers, y no se usan credenciales. Úsalas solo para documentación.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_APP = process.argv[2] ?? 'http://localhost:5199/';
const SALIDA = resolve(process.argv[3] ?? '../../docs/imagenes');
mkdirSync(SALIDA, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };

// ── Datos de demostración ─────────────────────────────────────────────────────
const sesion = {
  preferred_username: 'docente.demo',
  user_type: 'docente',
  roles: ['admin_lab', 'docente'],
  given_name: 'Ana',
  family_name: 'Demostración',
  name: 'Ana Demostración',
  email: 'ana.demo@ejemplo.edu',
  access_expires_at: Math.floor(Date.now() / 1000) + 3600,
};

const ahora = Date.now();
const iso = (minutosAtras) => new Date(ahora - minutosAtras * 60_000).toISOString();

const sesionDemo = (i, usuario, nombre, clase, practica, minInicio, minFin) => ({
  id: `demo-${i}`, clase, sesion_id: `s-${i}`, usuario, nombre, correo: `${usuario}@ejemplo.edu`,
  practica_id: practica ? `linux-m${(i % 3) + 1}` : null, practica_nombre: practica,
  inicio: iso(minInicio), ultimo_latido: iso(minFin ?? 0), fin: minFin == null ? null : iso(minFin),
  cierre: minFin == null ? null : 'cliente', ip: null,
  // Puntos repartidos por Bogotá para que no se solapen en el mapa
  ciudad: 'Bogotá', region: 'Bogotá D.C.', pais: 'Colombia',
  lat: 4.711 + (i - 3) * 0.013, lon: -74.072 + (((i * 7) % 5) - 2) * 0.016,
  fuente_ubicacion: 'ip', precision_m: null,
  ip_ciudad: 'Bogotá', ip_region: 'Bogotá D.C.', ip_pais: 'Colombia',
  ip_lat: 4.711 + (i - 3) * 0.013, ip_lon: -74.072 + (((i * 7) % 5) - 2) * 0.016, ip_org: null,
});

const usuariosDemo = [
  ['docente.demo', 'Ana', 'Demostración'], ['crojas', 'Camila', 'Rojas'], ['aperez', 'Andrés', 'Pérez'],
  ['lmunoz', 'Laura', 'Muñoz'], ['jtorres', 'Juan', 'Torres'], ['mgomez', 'María', 'Gómez'],
  ['dsilva', 'Daniel', 'Silva'], ['pramirez', 'Paula', 'Ramírez'],
].map(([username, firstName, lastName], i) => ({
  id: `u-${i + 1}`, username, firstName, lastName, email: `${username}@ejemplo.edu`, enabled: true,
  createdTimestamp: ahora - (200 - i * 17) * 86_400_000, attributes: {},
}));
const rolesDemo = { admin_lab: ['docente.demo'], docente: ['docente.demo'], estudiante: ['crojas', 'aperez', 'lmunoz', 'jtorres', 'mgomez', 'dsilva', 'pramirez'] };

const camarasDemo = ['Entrada del laboratorio', 'Mesa de robots', 'Banco de electrónica'];

const practicaDemo = (id, name, difficulty, resumen) => ({
  id, name, description: resumen, difficulty, resumen, connection: {}, terminal: {}, panels: {},
});

// Muestras de rendimiento: ondas suaves y reproducibles (no son medidas reales)
const muestras = Array.from({ length: 90 }, (_, k) => {
  const t = Math.floor(ahora / 1000) - (89 - k) * 2;
  const onda = (a, b, f) => Math.round((a + (b - a) * (0.5 + 0.5 * Math.sin(k / f))) * 10) / 10;
  const cpu = onda(12, 46, 7);
  return {
    t, cpu_pct: cpu, cpu_nucleos: [cpu, cpu * 0.8, cpu * 1.1, cpu * 0.7].map((x) => Math.round(x * 10) / 10), iowait_pct: 0.4,
    carga: [cpu / 40, cpu / 45, cpu / 50].map((x) => Math.round(x * 100) / 100),
    memoria: { total_mb: 3906, usada_mb: Math.round(onda(900, 1500, 11)), pct: onda(23, 38, 11), swap_usada_mb: 0 },
    temperatura_c: onda(48, 61, 13),
    frenado: {
      bajo_voltaje: false, frecuencia_limitada: false, frenada: false, limite_temperatura: false,
      hubo_bajo_voltaje: false, hubo_frenado: false,
    },
    red_rx_kbps: Math.round(onda(40, 600, 5)), red_tx_kbps: Math.round(onda(30, 900, 6)), conexiones: { ssh: 6, http: 3 },
    sesiones_ssh: { estudiantes: 6, estudiantes_distintos: 5, tuneles_app: 4, otras: 1 },
    camaras: { total: 3, por_camara: { 'Entrada del laboratorio': 2, 'Mesa de robots': 3, 'Banco de electrónica': 1 } },
    api: { peticiones: 120, errores: 0, en_curso: 1, p50_ms: 18, p95_ms: 64, max_ms: 140, bytes: 482000, por_tipo: {} },
    disco: { total_gb: 58, usado_gb: 17, pct: 29 },
  };
});

/** Respuesta (ya sin envelope) de cada comando; lo no listado devuelve `null`. */
const demo = {
  auth_status: () => sesion,
  sesiones_resumen: () => ({
    generado: iso(0), dias: 7,
    sesiones: [
      sesionDemo(1, 'crojas', 'Camila Rojas', 'practica', 'Primeros pasos en la terminal', 42, null),
      sesionDemo(2, 'aperez', 'Andrés Pérez', 'practica', 'Archivos y permisos', 25, null),
      sesionDemo(3, 'lmunoz', 'Laura Muñoz', 'app', null, 12, null),
      sesionDemo(4, 'jtorres', 'Juan Torres', 'practica', 'Robot EV3: primeros movimientos', 190, 150),
      sesionDemo(5, 'mgomez', 'María Gómez', 'practica', 'Procesos y servicios', 320, 270),
      sesionDemo(6, 'dsilva', 'Daniel Silva', 'app', null, 600, 560),
    ],
  }),
  admin_list_all_users: () => usuariosDemo,
  admin_list_users_by_role: ({ roleName }) =>
    usuariosDemo.filter((u) => (rolesDemo[roleName] ?? []).includes(u.username)),
  dispositivos_resumen: () => ({ generado: iso(0), dias: 7, dispositivos: [] }),
  nvr_list_cameras: () => camarasDemo.map((n, i) => ({
    id: `cam-${i + 1}`, name: n, status: 'active', stream_url: '', ptz: i === 1, webrtc: null,
  })),
  camaras_listar: () => ({
    camaras: camarasDemo.map((n, i) => ({
      id: `cam-${i + 1}`, nombre: n, host: `camara-0${i + 1}.ejemplo.local`, puerto: 554, usuario: 'admin',
      tienePassword: true, rtspPath: '/stream1', ptz: i === 1, habilitada: true, ruta: `cam${i + 1}`,
      estado: 'active', video: 'transmitiendo',
    })),
  }),
  practicas_list_categories: () => [
    {
      id: 'linux', name: 'Linux', description: 'Fundamentos de la terminal y administración de sistemas',
      icon: 'terminal', color: 'blue',
      practices: [
        practicaDemo('linux-m1', 'Primeros pasos en la terminal', 'Básico', 'Muévete por el sistema de archivos y ejecuta tus primeros comandos.'),
        practicaDemo('linux-m2', 'Archivos y permisos', 'Básico', 'Crea, copia y protege archivos con permisos de usuario y grupo.'),
        practicaDemo('linux-m3', 'Procesos y servicios', 'Intermedio', 'Observa procesos, termina los que se cuelgan y administra servicios.'),
      ],
    },
    {
      id: 'ev3', name: 'Robot EV3', description: 'Control y programación de un robot real a distancia',
      icon: 'robot', color: 'orange',
      practices: [
        practicaDemo('ev3-m1', 'Conoce a tu robot', 'Básico', 'Conecta con el robot y mueve sus motores desde el panel.'),
        practicaDemo('ev3-m2', 'Sensores en acción', 'Intermedio', 'Lee los sensores y reacciona a lo que el robot percibe.'),
      ],
    },
  ],
  list_hosts_entries: () => [
    { file: 'a1.json.enc', payload: { host: 'raspberry-lab-01.ejemplo.local', port: 22, user: 'estudiante', name: 'Raspberry Pi — Banco 1' } },
    { file: 'a2.json.enc', payload: { host: 'raspberry-lab-02.ejemplo.local', port: 22, user: 'estudiante', name: 'Raspberry Pi — Banco 2' } },
    { file: 'a3.json.enc', payload: { host: 'servidor-practicas.ejemplo.local', port: 22, user: 'docente', name: 'Servidor de prácticas' } },
  ],
  moodle_mis_cursos: () => ({
    enMoodle: true,
    cursos: [
      { id: 101, nombre: 'Sistemas Operativos', corto: 'SO-2026-1', rol: 'docente' },
      { id: 102, nombre: 'Redes de Computadores', corto: 'RC-2026-1', rol: 'docente' },
      { id: 103, nombre: 'Introducción a la Robótica', corto: 'IR-2026-1', rol: 'docente' },
    ],
  }),
  rendimiento_pi: () => ({
    intervalo_s: 2,
    info: { modelo: 'Raspberry Pi 4 Model B', nucleos: 4, interfaz: 'eth0', encendida_desde: Math.floor(ahora / 1000) - 3 * 86400 },
    muestras,
    procesos_top: [
      { comando: 'shinobi', usuario: 'pi', cpu_pct: 14.2, ram_mb: 310, procesos: 1 },
      { comando: 'mediamtx', usuario: 'pi', cpu_pct: 8.7, ram_mb: 95, procesos: 1 },
      { comando: 'node', usuario: 'pi', cpu_pct: 3.1, ram_mb: 120, procesos: 4 },
    ],
    servicios: [
      { unidad: 'broker-camaras', activo: true, estado: 'active', detalle: 'running', reinicios: 0 },
      { unidad: 'broker-sesiones', activo: true, estado: 'active', detalle: 'running', reinicios: 0 },
    ],
    usb: [],
  }),
};

// ── Tauri simulado ────────────────────────────────────────────────────────────
const initScript = () => {
  window.__llamadas = [];
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  const callbacks = {};
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
    transformCallback(cb) {
      const id = Math.floor(Math.random() * 1e9);
      callbacks[id] = cb;
      return id;
    },
    unregisterCallback(id) { delete callbacks[id]; },
    convertFileSrc: (p) => p,
    async invoke(cmd, args) {
      window.__llamadas.push(cmd);
      if (cmd === 'plugin:event|listen') return Math.floor(Math.random() * 1e9);
      if (cmd.startsWith('plugin:')) return null;
      const bruto = await window.__demo(cmd, JSON.stringify(args ?? {}));
      const valor = JSON.parse(bruto);
      // Protocolo versionado: los comandos migrados esperan un envelope
      if (args && args.req && typeof args.req === 'object' && 'payload' in args.req) {
        return { status: 'success', id: args.req.id, version: args.req.version, data: valor, elapsed_ms: 1 };
      }
      return valor;
    },
  };
};

// Sustituye cualquier dirección IPv4 visible (p. ej. la del equipo de entrada, fija en el código) antes de capturar
const enmascararIps = (pagina) => pagina.evaluate(() => {
  const ipv4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
  const caminante = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = caminante.nextNode(); n; n = caminante.nextNode()) {
    if (ipv4.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(ipv4, 'laboratorio.ejemplo.edu');
    ipv4.lastIndex = 0;
  }
  // Salvaguarda: si algo sigue pareciendo una IPv4 (p. ej. partida en varios nodos), no se guarda la captura
  if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(document.body.innerText)) {
    throw new Error('Queda una dirección IPv4 visible en la página: no se guarda la captura.');
  }
});

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'es-CO' });
const pagina = await ctx.newPage();
const vistos = new Set();
const errores = [];
await pagina.exposeFunction('__demo', (cmd, args) => {
  vistos.add(cmd);
  const f = demo[cmd];
  return JSON.stringify(f ? f(JSON.parse(args)) : null);
});
pagina.on('pageerror', (e) => errores.push(String(e).slice(0, 160)));
await pagina.addInitScript(initScript);

await pagina.goto(URL_APP, { waitUntil: 'networkidle' });
await pagina.waitForTimeout(2500);
await enmascararIps(pagina);
await pagina.screenshot({ path: resolve(SALIDA, 'inicio.png') });

// Páginas de la barra lateral: [archivo, texto del botón]
const paginas = [
  ['practicas', 'Prácticas'],
  ['conexiones', 'Conexiones'],
  ['mis-cursos', 'Mis cursos'],
  ['monitoreo', 'Monitoreo'],
  ['actividad', 'Actividad'],
  ['usuarios', 'Usuarios'],
];
for (const [archivo, texto] of paginas) {
  const antes = new Set(vistos);
  try {
    await pagina.getByRole('button', { name: texto, exact: true }).first().click({ timeout: 4000 });
  } catch {
    await pagina.getByText(texto, { exact: true }).first().click({ timeout: 4000 }).catch(() => {});
  }
  await pagina.waitForTimeout(1800);
  await enmascararIps(pagina);
  await pagina.screenshot({ path: resolve(SALIDA, `${archivo}.png`) });
  console.log(`[${archivo}] comandos nuevos:`, [...vistos].filter((c) => !antes.has(c)).sort().join(', ') || '(ninguno)');
}

console.log('Comandos pedidos por la app:', [...vistos].sort().join(', ') || '(ninguno)');
console.log('Errores de página:', errores.length ? '\n  ' + [...new Set(errores)].join('\n  ') : '(ninguno)');
await navegador.close();
