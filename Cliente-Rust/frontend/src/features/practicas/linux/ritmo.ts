// components/practicas/linux/ritmo.ts — cómo se reparte un módulo en pasos.
//
// Los módulos de Linux llegan como una lista plana de bloques y el chat los
// soltaba de golpe hasta el primer comando (texto, otro texto, imagen, video y
// la tarea). Quien arranca de cero no sabía qué leer primero ni qué tenía que
// hacer. Acá el módulo se parte en pasos numerados («Paso 3 de 8») que el chat
// entrega de a uno, y cada paso lista sus acciones concretas (abrir la imagen,
// mirar el video, escribir el comando...) para poder decir siempre «Ahora: ...».

import type { LinuxBlock } from '../linuxPractice.service';

type Bloque<T extends LinuxBlock['type']> = Extract<LinuxBlock, { type: T }>;

export interface PasoPractica {
  /** `paso-<numero>`: también es el id del freno que abre su botón «Siguiente paso». */
  id: string;
  numero: number;
  bloques: LinuxBlock[];
  /** Sin comandos no hay nada que validar: se avanza con el botón «Siguiente paso». */
  conBoton: boolean;
  /** Texto del botón cuando el módulo lo trae (frenos de EV3); si no, «Siguiente paso». */
  etiquetaBoton?: string;
  /** Es el primer paso del módulo que pide escribir en la terminal: ahí se explica qué es. */
  primerComando?: boolean;
}

/**
 * Evento de ventana con el que un paso le pide a la terminal de su sesión
 * (TerminalView) que se marque mientras toca escribir en ella, o que tome el
 * foco («Ir a la terminal»). Quien arranca de cero no sabe qué es «la
 * terminal» ni dónde está: se la señalamos en la pantalla.
 */
export const EVENTO_GUIA_TERMINAL = 'practica:guia-terminal';

export interface DetalleGuiaTerminal {
  sessionId: string;
  /** Quién la pide (id del paso): la marca sigue mientras algún paso la pida. */
  origen: string;
  resaltar?: boolean;
  enfocar?: boolean;
}

export function guiarTerminal(detalle: DetalleGuiaTerminal) {
  window.dispatchEvent(new CustomEvent<DetalleGuiaTerminal>(EVENTO_GUIA_TERMINAL, { detail: detalle }));
}

export interface PlanPractica {
  pasos: PasoPractica[];
  preguntas: Bloque<'quiz'>[];
  /** Pasos + el de las preguntas, si hay. */
  total: number;
}

const esComando = (b: LinuxBlock): b is Bloque<'command_step'> => b.type === 'command_step';
const esMaterial = (b: LinuxBlock) => b.type !== 'text' && b.type !== 'command_step';

/**
 * Parte el módulo en pasos. Si el módulo marca sus propios frenos (`step_gate`,
 * EV3), cada freno cierra un paso. Si no (Linux), el corte sale del contenido:
 * - un texto nuevo es una idea nueva: abre paso;
 * - un comando va en su propio paso, salvo que lo presente el texto que va justo
 *   antes (así el material se mira primero y el comando se escribe después);
 * - lo que viene después de un comando abre paso.
 */
export function armarPlan(blocks: LinuxBlock[]): PlanPractica {
  const preguntas = blocks.filter((b): b is Bloque<'quiz'> => b.type === 'quiz');
  const flujo = blocks.filter((b) => b.type !== 'quiz' && b.type !== 'checkpoint');
  const conFrenos = flujo.some((b) => b.type === 'step_gate');

  const grupos: { bloques: LinuxBlock[]; etiquetaBoton?: string }[] = [];
  let actual: LinuxBlock[] = [];
  const cerrar = (etiquetaBoton?: string) => {
    if (actual.length > 0) grupos.push({ bloques: actual, etiquetaBoton });
    actual = [];
  };

  for (const b of flujo) {
    if (conFrenos) {
      if (b.type === 'step_gate') cerrar(b.label);
      else actual.push(b);
      continue;
    }
    const conComando = actual.some(esComando);
    const nuevo =
      b.type === 'text' ? actual.length > 0
      : esComando(b) ? conComando || actual.some(esMaterial)
      : conComando;
    if (nuevo) cerrar();
    actual.push(b);
  }
  cerrar();

  const primero = grupos.findIndex((g) => g.bloques.some(esComando));
  const pasos = grupos.map((g, i) => ({
    id: `paso-${i + 1}`,
    numero: i + 1,
    bloques: g.bloques,
    conBoton: !g.bloques.some(esComando),
    etiquetaBoton: g.etiquetaBoton,
    primerComando: i === primero,
  }));
  return { pasos, preguntas, total: pasos.length + (preguntas.length > 0 ? 1 : 0) };
}

/** Bloques interactivos que se «hacen» tocándolos (simuladores, calculadoras...). */
const EJERCICIOS = new Set<LinuxBlock['type']>([
  'wheels_sim', 'calculator', 'sensor_demo', 'state_machine', 'checklist', 'permissions_calculator',
]);

export type TipoAccion = 'leer' | 'imagen' | 'video' | 'ejercicio' | 'comando' | 'reto' | 'siguiente';

export interface AccionPaso {
  /** Id del bloque al que apunta (o `leer` / `siguiente`). */
  id: string;
  tipo: TipoAccion;
  /** Cómo aparece en la lista del paso. */
  texto: string;
  comando?: string;
}

/** Lo que el estudiante tiene que hacer en el paso, en orden. */
export function accionesDelPaso(paso: PasoPractica): AccionPaso[] {
  const acciones: AccionPaso[] = [];
  if (paso.bloques.some((b) => b.type === 'text')) {
    acciones.push({ id: 'leer', tipo: 'leer', texto: 'Lee la explicación' });
  }
  const imagenes = paso.bloques.filter((b) => b.type === 'media' && b.kind === 'image').length;
  let nImagen = 0;
  for (const b of paso.bloques) {
    if (b.type === 'media') {
      if (b.kind === 'video') {
        acciones.push({ id: b.id, tipo: 'video', texto: 'Mira el video' });
      } else {
        nImagen += 1;
        acciones.push({ id: b.id, tipo: 'imagen', texto: imagenes > 1 ? `Abre la imagen ${nImagen}` : 'Abre la imagen' });
      }
    } else if (EJERCICIOS.has(b.type)) {
      acciones.push({ id: b.id, tipo: 'ejercicio', texto: 'Prueba el ejercicio' });
    } else if (esComando(b)) {
      acciones.push(
        b.goal_md
          ? { id: b.id, tipo: 'reto', texto: 'Resuelve el reto en la terminal' }
          : { id: b.id, tipo: 'comando', texto: `Escribe ${b.command} en la terminal`, comando: b.command },
      );
    }
  }
  if (paso.conBoton) acciones.push({ id: 'siguiente', tipo: 'siguiente', texto: 'Pasa al siguiente paso' });
  return acciones;
}

/** Título del paso: dice qué se va a hacer, no de qué trata. */
export function tituloDelPaso(paso: PasoPractica): string {
  const comando = paso.bloques.find(esComando);
  if (comando) return comando.goal_md ? 'Resuelve el reto' : 'Escribe un comando';
  if (paso.bloques.some((b) => EJERCICIOS.has(b.type))) return 'Prueba el ejercicio';
  // «Lee y…» solo si hay algo que leer: hay pasos que son únicamente una imagen.
  const lee = paso.bloques.some((b) => b.type === 'text') ? 'Lee y mira' : 'Mira';
  if (paso.bloques.some((b) => b.type === 'media' && b.kind === 'video')) return `${lee} el video`;
  if (paso.bloques.some((b) => b.type === 'media')) return `${lee} la imagen`;
  return 'Lee la explicación';
}

/** Qué decir en la franja «Ahora:» para una acción (sin el «Ahora:»). */
export function instruccion(accion: AccionPaso, etiquetaBoton = 'Siguiente paso'): string {
  switch (accion.tipo) {
    case 'leer': return 'lee la explicación del paso.';
    case 'imagen': return 'pulsa «Ampliar imagen» para verla en grande.';
    case 'video': return 'pulsa «Ver video» y míralo completo.';
    case 'ejercicio': return 'prueba el ejercicio: toca sus controles y mira qué cambia.';
    case 'comando': return `escribe ${accion.comando} en la terminal y presiona Enter.`;
    case 'reto': return 'resuelve el reto escribiendo en la terminal. Si te trabas, escríbeme tu duda aquí abajo.';
    case 'siguiente': return `pulsa «${etiquetaBoton}» para continuar.`;
  }
}

/**
 * La acción que toca ahora y la que hay que resaltar. Leer no tiene botón: si
 * es lo que toca, la franja encadena la siguiente acción («lee... Cuando
 * termines, pulsa...») y se resalta esa.
 */
export function accionActual(acciones: AccionPaso[], hechas: Set<string>): { actual: AccionPaso | null; resaltada: AccionPaso | null } {
  const pendientes = acciones.filter((a) => !hechas.has(a.id));
  const actual = pendientes[0] ?? null;
  const resaltada = actual?.tipo === 'leer' ? (pendientes[1] ?? null) : actual;
  return { actual, resaltada };
}
