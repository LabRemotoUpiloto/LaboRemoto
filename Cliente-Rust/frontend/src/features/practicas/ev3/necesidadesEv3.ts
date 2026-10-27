// features/practicas/ev3/necesidadesEv3.ts — qué herramientas del robot necesita cada módulo de EV3.
//
// La vista guiada (VistaPracticaEv3) no abre todo de entrada: el escenario (cámara o gemelo 3D) y la guía siempre
// están; el resto vive en un riel y cada módulo dice en qué estado arranca cada herramienta. Regla para decidirlo,
// paso por paso del módulo:
//   1. ¿Algún paso pide actuar sobre la herramienta?           → «paso»: se marca como nueva en este módulo.
//   2. ¿Se aprendió en un módulo anterior y se sigue usando?  → «inicio»: disponible, cerrada.
//   3. ¿No hace falta en este módulo?                          → «bloqueada»: con candado, pero se puede abrir.
//   4. ¿No tiene sentido mostrarla?                            → «oculta»: no sale en el riel.
// Un módulo puede declarar lo suyo en `environment.tools` (module.json) y eso manda sobre esta tabla.

export type HerramientaEv3 = 'motores' | 'sensores' | 'consola' | 'avanzado';
export type EstadoHerramienta = 'inicio' | 'paso' | 'bloqueada' | 'oculta';
export type VistaEscenario = 'camara' | 'gemelo';

/** Orden en el riel: de lo más concreto (mover el robot) a lo más técnico. */
export const HERRAMIENTAS_EV3: HerramientaEv3[] = ['motores', 'sensores', 'consola', 'avanzado'];

export const TITULO_HERRAMIENTA: Record<HerramientaEv3, string> = {
  motores: 'Motores',
  sensores: 'Sensores',
  consola: 'Consola de Python',
  avanzado: 'Estado del robot',
};

export interface NecesidadesModulo {
  herramientas: Record<HerramientaEv3, EstadoHerramienta>;
  /** Herramienta que se abre sola al entrar (la principal del módulo), o ninguna. */
  abierta: HerramientaEv3 | null;
}

const m = (
  motores: EstadoHerramienta,
  sensores: EstadoHerramienta,
  consola: EstadoHerramienta,
  avanzado: EstadoHerramienta,
  abierta: HerramientaEv3 | null = null,
): NecesidadesModulo => ({ herramientas: { motores, sensores, consola, avanzado }, abierta });

/** Matriz de la propuesta de rediseño (fase 1). Los ids son los de infra/practicas-ev3. */
export const NECESIDADES_EV3: Record<string, NecesidadesModulo> = {
  'ev3-m1': m('paso', 'bloqueada', 'bloqueada', 'bloqueada'), // Conociendo el EV3: mover las ruedas
  'ev3-m2': m('inicio', 'paso', 'bloqueada', 'bloqueada'), // Sensores en acción
  'ev3-m3': m('inicio', 'bloqueada', 'paso', 'bloqueada'), // Movimiento preciso: motores con grados y consola al final
  'ev3-m4': m('inicio', 'inicio', 'paso', 'bloqueada'), // Comportamientos reactivos
  'ev3-m5': m('bloqueada', 'bloqueada', 'inicio', 'bloqueada', 'consola'), // Python para robots: la consola es el centro
  'ev3-m6': m('inicio', 'inicio', 'inicio', 'paso'), // Depuración: alertas, batería y conexión
  'ev3-m7': m('bloqueada', 'bloqueada', 'bloqueada', 'bloqueada'), // Laboratorio con criterio: solo mirar y saber detener
  'ev3-m8': m('inicio', 'inicio', 'inicio', 'inicio'), // Proyecto integrador: todo disponible
  'ev3-m9': m('paso', 'paso', 'paso', 'paso'), // Panel de control: recorre todas las herramientas
};

/** Módulo nuevo que todavía no está en la tabla: mejor tener todo a mano que esconder lo que necesita. */
const POR_DEFECTO: NecesidadesModulo = m('inicio', 'inicio', 'inicio', 'inicio');

const ESTADOS = new Set<EstadoHerramienta>(['inicio', 'paso', 'bloqueada', 'oculta']);
const esHerramienta = (v: unknown): v is HerramientaEv3 => HERRAMIENTAS_EV3.includes(v as HerramientaEv3);

/**
 * Necesidades de un módulo: la tabla de arriba, con lo que el módulo declare en `environment.tools` encima.
 * Lo que venga mal escrito en el módulo se ignora (vale la tabla), para que un error de contenido no rompa la vista.
 * `environment.tools.abierta` puede nombrar la herramienta que se abre sola.
 */
export function necesidadesDe(moduleId: string, declaradas?: Record<string, unknown> | null): NecesidadesModulo {
  const base = NECESIDADES_EV3[moduleId] ?? POR_DEFECTO;
  const herramientas = { ...base.herramientas };
  let abierta = base.abierta;
  if (declaradas && typeof declaradas === 'object') {
    for (const [clave, valor] of Object.entries(declaradas)) {
      if (clave === 'abierta') {
        if (valor === null || valor === 'ninguna') abierta = null;
        else if (esHerramienta(valor)) abierta = valor;
      } else if (esHerramienta(clave) && ESTADOS.has(valor as EstadoHerramienta)) {
        herramientas[clave] = valor as EstadoHerramienta;
      }
    }
  }
  // Una herramienta oculta no se puede abrir sola.
  if (abierta && herramientas[abierta] === 'oculta') abierta = null;
  return { herramientas, abierta };
}

/** Herramientas que van en el riel, en orden. */
export const herramientasVisibles = (n: NecesidadesModulo): HerramientaEv3[] =>
  HERRAMIENTAS_EV3.filter((h) => n.herramientas[h] !== 'oculta');
