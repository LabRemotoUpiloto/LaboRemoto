// app/diferidos.ts — lo que no hace falta para pintar Inicio se carga aparte. Al arrancar solo llega lo de la portada; el resto
// se baja de fondo en cuanto la app queda quieta (precargarEnReposo) y antes, si hay una señal de que se va a usar (precargar:
// el mouse sobre una entrada de la barra, abrir Prácticas o Conexiones…). Cuando la persona llega, ya está.
//
// Cada pieza es un `import()`: el navegador lo pide una sola vez y, si ya está en camino, quien lo pida después espera a ese
// mismo pedido. En Tauri los archivos vienen dentro de la app instalada, así que no dependen de la red.
import { lazy } from 'react';

const cargas = {
  // páginas
  conexiones: () => import('@/features/conexion/ConexionesPage'),
  invitado: () => import('@/features/conexion/GuestConnectPage'),
  temas: () => import('@/features/cuenta/ThemesPage'),
  perfil: () => import('@/features/cuenta/PerfilPage'),
  ajustes: () => import('@/features/cuenta/AjustesPage'),
  practicas: () => import('@/features/practicas/PracticesPage'),
  reservas: () => import('@/features/reservas/ReservasPage'),
  cursos: () => import('@/features/cursos/MisCursosPage'),
  usuarios: () => import('@/features/usuarios/UserManagementPage'),
  vigilancia: () => import('@/features/camaras/VigilanciaPage'),
  actividad: () => import('@/features/actividad/DashboardPage'),
  monitoreo: () => import('@/features/monitoreo/RendimientoPage'),
  // sesiones (terminal, chat, archivos, escritorio…) y registros abiertos
  sesion: () => import('@/features/sesion/SessionContainer'),
  registros: () => import('@/features/logs/LogTabsContainer'),
  pines: () => import('@/features/hardware/gpio/PinsPanel'),
  domotica: () => import('@/features/hardware/arduino/DomoticaPanel'),
  // librerías pesadas que se usan dentro de una sesión
  lectores: () => import('@/features/chat/panel/lectoresDocumento'),
  ev3: () => import('@/features/hardware/ev3/Ev3Twin'),
  escritorio: () => import('@novnc/novnc/lib/rfb'),
};

export type Pieza = keyof typeof cargas;

export const ConexionesPage = lazy(cargas.conexiones);
export const GuestConnectPage = lazy(cargas.invitado);
export const ThemesPage = lazy(cargas.temas);
export const PerfilPage = lazy(cargas.perfil);
export const AjustesPage = lazy(cargas.ajustes);
export const PracticesPage = lazy(cargas.practicas);
export const ReservasPage = lazy(cargas.reservas);
export const MisCursosPage = lazy(cargas.cursos);
export const UserManagementPage = lazy(cargas.usuarios);
export const VigilanciaPage = lazy(cargas.vigilancia);
export const DashboardPage = lazy(cargas.actividad);
export const RendimientoPage = lazy(cargas.monitoreo);
export const SessionContainer = lazy(cargas.sesion);
export const LogTabsContainer = lazy(cargas.registros);
export const PinsPanel = lazy(cargas.pines);
export const DomoticaPanel = lazy(cargas.domotica);
export const Ev3Twin = lazy(cargas.ev3);

/** Los lectores de PDF y Word del chat (pdfjs, mammoth). */
export const cargarLectores = cargas.lectores;

/** Empieza a bajar estas piezas sin esperar a que terminen. Un fallo no importa aquí: se reintenta al usarlas. */
export function precargar(...piezas: Pieza[]) {
  for (const p of piezas) void cargas[p]().catch(() => {});
}

/** Qué pieza trae cada página de la barra lateral (los id de `Sidebar.tsx` y `HomeContainer.tsx`). */
const PIEZA_DE_PAGINA: Record<string, Pieza[]> = {
  connect: ['conexiones', 'sesion'],
  hosts: ['conexiones', 'sesion'],
  logs: ['conexiones'],
  'ssh-guest': ['invitado', 'sesion'],
  themes: ['temas'],
  perfil: ['perfil'],
  ajustes: ['ajustes'],
  practices: ['practicas', 'sesion'],
  encuestas: ['practicas'],
  reservas: ['reservas'],
  'mis-cursos': ['cursos'],
  'admin-users': ['usuarios'],
  vigilancia: ['vigilancia'],
  dashboard: ['actividad'],
  rendimiento: ['monitoreo'],
};

/** Señal de que la persona va a abrir esta página (mouse encima, foco con el teclado). */
export function precargarPagina(id: string) {
  const piezas = PIEZA_DE_PAGINA[id];
  if (piezas) precargar(...piezas);
}

/** Orden de la carga de fondo: lo más probable primero. */
const ORDEN_DE_FONDO: Pieza[] = [
  'sesion', 'conexiones', 'practicas', 'lectores',
  'cursos', 'reservas', 'perfil', 'ajustes', 'temas',
  'monitoreo', 'actividad', 'vigilancia', 'usuarios', 'registros', 'pines', 'domotica',
  'ev3', 'escritorio', 'invitado',
];

let enMarcha = false;

/** Después del primer dibujo: baja todo lo demás de a una pieza, cada vez que el navegador queda libre. */
export function precargarEnReposo() {
  if (enMarcha) return;
  enMarcha = true;
  const libre: (fn: () => void) => void = 'requestIdleCallback' in window
    ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 200);
  const siguiente = (i: number) => {
    if (i >= ORDEN_DE_FONDO.length) return;
    libre(() => {
      void cargas[ORDEN_DE_FONDO[i]]().catch(() => {}).finally(() => siguiente(i + 1));
    });
  };
  // un respiro para que la portada termine de pintarse y de pedir sus datos
  setTimeout(() => siguiente(0), 800);
}
