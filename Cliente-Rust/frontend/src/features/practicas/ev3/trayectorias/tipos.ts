// features/practicas/ev3/trayectorias/tipos.ts — tipos y valores por defecto del editor de trayectorias del EV3.
//
// Portado del editor de investigacion_ev3 (rama version_api, src/lib/trayectoria). Una trayectoria es una lista de
// `Primitiva`: el lienzo, la lista de comandos y el simulador son vistas de esa misma lista.

/** Una primitiva de movimiento. Ángulos en grados: positivo = antihorario. */
export type Primitiva =
  | { tipo: 'avanzar'; cm: number }
  | { tipo: 'girar'; grados: number }
  | { tipo: 'arco'; radioCm: number; grados: number }
  | { tipo: 'pausa'; ms: number };

export type TipoPrimitiva = Primitiva['tipo'];

/** Parámetros físicos del robot y de calibración: todo lo que depende del hardware vive aquí. */
export interface ConfigRobot {
  /** Diámetro de la rueda (D), cm. */
  diametroRuedaCm: number;
  /** Distancia entre ruedas (E), cm. */
  anchoViaCm: number;
  /** Corrección empírica (k) por deslizamiento. */
  factorCalibracion: number;
}

/** Pose 2D del robot. `th` es el rumbo en grados, siempre en (-180, 180]. */
export interface Pose {
  x: number;
  y: number;
  th: number;
}

export interface Punto {
  x: number;
  y: number;
}

/** Grados que gira cada motor. */
export interface GradosMotores {
  izquierda: number;
  derecha: number;
}

/** Valores del EV3 del laboratorio (ruedas de 5,6 cm, como en la práctica «Movimiento preciso»). */
export const CONFIG_POR_DEFECTO: ConfigRobot = {
  diametroRuedaCm: 5.6,
  anchoViaCm: 12.0,
  factorCalibracion: 1.0,
};
