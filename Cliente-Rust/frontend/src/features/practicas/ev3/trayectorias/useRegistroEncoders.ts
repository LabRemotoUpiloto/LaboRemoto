// features/practicas/ev3/trayectorias/useRegistroEncoders.ts — graba la posición de los encoders de las dos ruedas
// mientras el robot se mueve, para reconstruir la trayectoria real (odometria.ts) y compararla con la planeada.
//
// No mueve el robot: se graba mientras se maneja por otro medio (el control por teclado del cajón Motores). Las
// lecturas se guardan relativas al momento en que se pulsó «Grabar», no al cero del encoder, que arrastra lo que el
// motor giró antes; así la trayectoria real arranca en el origen del lienzo.
import { useEffect, useRef, useState } from 'react';
import type { Ev3Status } from '@/features/hardware/ev3.service';
import type { GradosMotores } from './tipos';

export interface RegistroEncoders {
  /** false si el robot no envía `position` (main.py antiguo): no hay trayectoria real. */
  disponible: boolean;
  grabando: boolean;
  historial: GradosMotores[];
  iniciar: () => void;
  detener: () => void;
  reiniciar: () => void;
}

/** Posición del encoder de un puerto (`outA` o `A`), o null si el motor no está o no la envía. */
export function posicionDe(status: Ev3Status | null, puerto: string): number | null {
  const letra = puerto.replace(/^out/i, '').toUpperCase();
  const motor = status?.motors.find((m) => m.port.replace(/^out/i, '').toUpperCase() === letra);
  return motor?.connected && typeof motor.position === 'number' ? motor.position : null;
}

export function useRegistroEncoders(status: Ev3Status | null, puertoIzquierda: string, puertoDerecha: string): RegistroEncoders {
  const [grabando, setGrabando] = useState(false);
  const [historial, setHistorial] = useState<GradosMotores[]>([]);
  const origen = useRef<GradosMotores | null>(null);

  const posIzq = posicionDe(status, puertoIzquierda);
  const posDer = posicionDe(status, puertoDerecha);
  const disponible = posIzq !== null && posDer !== null;

  useEffect(() => {
    if (!grabando || posIzq === null || posDer === null) return;
    if (!origen.current) origen.current = { izquierda: posIzq, derecha: posDer };
    const { izquierda, derecha } = origen.current;
    setHistorial((h) => [...h, { izquierda: posIzq - izquierda, derecha: posDer - derecha }]);
  }, [grabando, posIzq, posDer]);

  // Cambiar de rueda en plena grabación mezclaría dos motores: se empieza de cero.
  useEffect(() => {
    origen.current = null;
    setHistorial([]);
  }, [puertoIzquierda, puertoDerecha]);

  return {
    disponible,
    grabando,
    historial,
    iniciar: () => { origen.current = null; setHistorial([]); setGrabando(true); },
    detener: () => setGrabando(false),
    reiniciar: () => { origen.current = null; setHistorial([]); },
  };
}
