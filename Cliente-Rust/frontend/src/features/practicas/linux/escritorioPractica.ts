// features/practicas/linux/escritorioPractica.ts — la práctica usa el escritorio remoto de su sesión.
//
// Para entender qué es una interfaz gráfica, el estudiante la ve y la usa: se le abre el escritorio de la misma
// Raspberry (vista «Escritorio», acotado: solo trae la terminal), abre ahí la terminal con doble clic y después
// cierra el escritorio y vuelve a su terminal de siempre. Es el mismo computador, manejado con clics o escribiendo.
//
// Dos bloques del módulo:
// - `desktop_task`: abrir un programa en el escritorio. Se completa solo: PasoCard le pregunta a la Pi (por la
//   conexión SSH de la sesión) si la ventana ya está abierta.
// - `desktop_close`: botón para cerrar el escritorio y volver a la terminal.
// Se coordinan por eventos de documento, como el resto de la práctica (ver STEP_GATE_EVENT).

/** Pide a la app mostrar una vista de la sesión de la práctica (la escucha App con `setActiveView`). */
export const EVENTO_VISTA_PRACTICA = 'practica:vista';

export interface DetalleVistaPractica {
  vista: 'escritorio' | 'terminal';
}

export function pedirVista(vista: DetalleVistaPractica['vista']) {
  document.dispatchEvent(new CustomEvent<DetalleVistaPractica>(EVENTO_VISTA_PRACTICA, { detail: { vista } }));
}

/** Pide al escritorio remoto de una sesión que se apague (lo escucha DesktopPane): libera la memoria de la Pi. */
export const EVENTO_DETENER_ESCRITORIO = 'escritorio:detener';

export interface DetalleDetenerEscritorio {
  sessionId: string;
}

export function detenerEscritorio(sessionId: string) {
  document.dispatchEvent(new CustomEvent<DetalleDetenerEscritorio>(EVENTO_DETENER_ESCRITORIO, { detail: { sessionId } }));
}

/** Una acción del escritorio (`desktop_task` o `desktop_close`) quedó hecha. detail: `{ id }` del bloque. */
export const EVENTO_ACCION_ESCRITORIO = 'practica:accion-escritorio';

// Vive fuera de React: lo leen PasoCard (para pintar el paso) y ChatPane (para entregar el siguiente).
const hechas = new Set<string>();

export function accionEscritorioHecha(id: string): boolean {
  return hechas.has(id);
}

export function marcarAccionEscritorio(id: string) {
  if (hechas.has(id)) return;
  hechas.add(id);
  document.dispatchEvent(new CustomEvent<{ id: string }>(EVENTO_ACCION_ESCRITORIO, { detail: { id } }));
}

/** Al empezar otra práctica: las acciones son por módulo (como los pasos entregados). */
export function olvidarAccionesEscritorio() {
  hechas.clear();
}

/** Cada cuánto se pregunta a la Pi si el estudiante ya abrió el programa. */
export const INTERVALO_DETECCION_MS = 2500;

/** Programas que una tarea del escritorio puede pedir, con su nombre en pantalla. */
export const PROGRAMAS_ESCRITORIO = {
  terminal: { nombre: 'la terminal', icono: 'Terminal' },
} as const;

export type ProgramaEscritorio = keyof typeof PROGRAMAS_ESCRITORIO;
