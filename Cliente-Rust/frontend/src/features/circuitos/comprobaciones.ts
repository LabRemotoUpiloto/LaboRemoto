// features/circuitos/comprobaciones.ts — lo que una práctica pide del circuito, escrito como datos (sin programar, en el JSON de la
// práctica) y evaluado sobre el estado que manda el simulador. Este cálculo en la app es para que el estudiante vea su avance en vivo;
// la nota oficial se calculará en el servidor con las mismas reglas.
import type { EstadoSimulador } from './simulador';

export type Comprobacion = { id: string } & (
  /** La pieza está en la protoboard o conectada con cables (algún pin tiene red). */
  | { type: 'connected'; part: string; text: string }
  /** Pasa corriente por el LED (más de 0,1 mA): el circuito está cerrado y el LED bien orientado. */
  | { type: 'led_on'; led: string; text: string }
  /** Ninguna de estas piezas se quemó. */
  | { type: 'not_burnt'; parts: string[]; text: string }
  /** La corriente del LED queda entre min y max (amperios). */
  | { type: 'led_current'; led: string; min: number; max: number; text: string }
);

export type Resultado = 'bien' | 'falta' | 'mal';

const UMBRAL_ENCENDIDO = 1e-4;

/** Corriente por un LED (A), positiva; null si el simulador todavía no la calculó. */
export function corrienteLed(estado: EstadoSimulador, led: string): number | null {
  const i = estado.corrientes[`v_${led.toLowerCase()}_sense`];
  return typeof i === 'number' && Number.isFinite(i) ? Math.abs(i) : null;
}

/** Valor de una resistencia en ohmios, leído de sus propiedades ('330', '1k', '4.7k', '1M'). */
export function valorResistencia(estado: EstadoSimulador, id: string): number | null {
  const v = estado.componentes.find((c) => c.id === id)?.propiedades.value;
  if (v == null) return null;
  const m = /^\s*([\d.]+)\s*([kKmM]?)/.exec(String(v));
  if (!m) return null;
  const mult = m[2] === 'k' || m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'm' ? 1e-3 : 1;
  return Number(m[1]) * mult;
}

export function evaluar(c: Comprobacion, estado: EstadoSimulador | null): Resultado {
  if (!estado) return 'falta';
  switch (c.type) {
    case 'connected':
      return Object.keys(estado.redes).some((k) => k.startsWith(`${c.part}:`)) ? 'bien' : 'falta';
    case 'led_on': {
      const i = corrienteLed(estado, c.led);
      return i != null && i > UMBRAL_ENCENDIDO && !estado.quemadas.includes(c.led) ? 'bien' : 'falta';
    }
    case 'not_burnt':
      return c.parts.some((p) => estado.quemadas.includes(p)) ? 'mal' : 'bien';
    case 'led_current': {
      if (estado.quemadas.includes(c.led)) return 'mal';
      const i = corrienteLed(estado, c.led);
      if (i == null || i <= UMBRAL_ENCENDIDO) return 'falta';
      return i >= c.min && i <= c.max ? 'bien' : 'mal';
    }
    default:
      // una comprobación de un tipo que esta versión de la app no conoce: no se marca como hecha
      return 'falta';
  }
}
