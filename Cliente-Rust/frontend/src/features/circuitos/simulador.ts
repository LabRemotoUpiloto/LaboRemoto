// features/circuitos/simulador.ts — conversación con el simulador de circuitos (el fork de Velxio del laboratorio, servicio aparte con
// su propia licencia AGPL), que la app muestra en un iframe. Solo se intercambian mensajes: la app no lleva código del simulador.
//   app → simulador   { fuente: 'laboremoto', version: 1, tipo: 'cargar', circuito } | { tipo: 'pedir-estado' }
//   simulador → app   { fuente: 'velxio-lab', version: 1, tipo: 'listo' | 'estado' | 'error', … }
// Los tipos espejo de los del fork están en su `frontend/src/laboremoto/puente.ts`.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Dónde corre el simulador. Por ahora el contenedor local; en la Pi 5 se configura con VITE_SIMULADOR_CIRCUITOS_URL. */
export const URL_SIMULADOR: string = (import.meta.env.VITE_SIMULADOR_CIRCUITOS_URL as string | undefined) ?? 'http://localhost:3080';
const ORIGEN_SIMULADOR = new URL(URL_SIMULADOR).origin;

/** Una imagen o un video de los pasos: los sirve el simulador, igual que las prácticas. */
export const urlMedia = (archivo: string) => `${URL_SIMULADOR}/api/laboremoto/media/${encodeURIComponent(archivo)}`;
const VERSION = 1;

export interface PiezaCircuito {
  /** Tipo del simulador con su prefijo: 'wokwi-resistor', 'wokwi-led', 'wokwi-battery-9v', 'velxio-breadboard'… */
  type: string;
  id: string;
  x: number;
  y: number;
  properties?: Record<string, unknown>;
}

export interface CableCircuito {
  id: string;
  start: { componentId: string; pinName: string };
  end: { componentId: string; pinName: string };
  color?: string;
}

export interface Circuito {
  componentes: PiezaCircuito[];
  cables: CableCircuito[];
}

/** Lo que manda el simulador cada vez que cambia el circuito o su solución. */
export interface EstadoSimulador {
  componentes: { id: string; tipo: string; propiedades: Record<string, unknown> }[];
  cables: { id: string; de: string; a: string }[];
  /** "pieza:pin" → red */
  redes: Record<string, string>;
  /** red → voltios (la red 0 no aparece: vale 0) */
  voltajes: Record<string, number>;
  /** fuente de ngspice → amperios: v_<led>_sense, v_<pila>, v_<amperimetro>_sense */
  corrientes: Record<string, number>;
  quemadas: string[];
  convergio: boolean;
  error: string | null;
}

export type Conexion = 'cargando' | 'listo' | 'sin-servicio';

/**
 * Habla con el iframe del simulador: cuando avisa que está listo le manda el circuito inicial y desde ahí guarda cada estado.
 * `cargar()` vuelve a mandar el circuito (para «Empezar de nuevo»).
 */
export function useSimulador(circuitoInicial: Circuito) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [conexion, setConexion] = useState<Conexion>('cargando');
  const [estado, setEstado] = useState<EstadoSimulador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inicial = useRef(circuitoInicial);
  inicial.current = circuitoInicial;

  const enviar = useCallback((mensaje: object) => {
    marco.current?.contentWindow?.postMessage({ fuente: 'laboremoto', version: VERSION, ...mensaje }, ORIGEN_SIMULADOR);
  }, []);

  const cargar = useCallback(() => {
    setEstado(null);
    enviar({ tipo: 'cargar', circuito: inicial.current });
  }, [enviar]);

  useEffect(() => {
    const alRecibir = (ev: MessageEvent) => {
      if (ev.origin !== ORIGEN_SIMULADOR || ev.source !== marco.current?.contentWindow) return;
      const m = ev.data as { fuente?: string; tipo?: string; mensaje?: string } & Partial<EstadoSimulador>;
      if (m?.fuente !== 'velxio-lab') return;
      if (m.tipo === 'listo') {
        setConexion('listo');
        cargar();
      } else if (m.tipo === 'estado') {
        setEstado(m as EstadoSimulador);
      } else if (m.tipo === 'error') {
        setError(m.mensaje ?? 'El simulador no pudo cargar el circuito');
      }
    };
    window.addEventListener('message', alRecibir);
    // si en 20 s no avisó que está listo, el servicio no está corriendo (o no deja mostrarse aquí)
    const espera = setTimeout(() => setConexion((c) => (c === 'cargando' ? 'sin-servicio' : c)), 20000);
    return () => {
      window.removeEventListener('message', alRecibir);
      clearTimeout(espera);
    };
  }, [cargar]);

  return { marco, src: `${URL_SIMULADOR}/laboremoto`, conexion, estado, error, cargar };
}
