// features/hardware/ev3/useEv3Estado.ts — sondeo de la telemetría del robot EV3 y acciones de motor de una sesión.
//
// Lo usan el Panel EV3 (vista completa) y la vista guiada de la práctica (practicas/ev3/VistaPracticaEv3); nunca los
// dos a la vez en la misma sesión. Publica cada lectura en ev3Telemetry para que los bloques del chat no consulten al
// robot otra vez, y adelanta la carga del gemelo 3D.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEv3Status, setEv3Motor, stopEv3Motors, type Ev3Status } from '../ev3.service';
import { publishEv3Status } from '../ev3Telemetry';
import { precargar } from '@/app/diferidos';

const POLL_MS = 1000;

export interface Ev3Estado {
  status: Ev3Status | null;
  /** Consigna de un motor en % (−100…100). */
  setSpeed: (port: string, speed: number) => void;
  /** Detiene todos los motores. La promesa falla si el robot no confirmó. */
  stopAll: () => Promise<void>;
}

/**
 * `robot`: IP o nombre `.local` de un robot físico en la red local; con él todo va directo al robot (vista «Probar con
 * mi robot») y `sessionId` es solo una etiqueta. Sin él, por el laboratorio con la sesión SSH `sessionId`.
 */
export function useEv3Estado(sessionId: string, robot?: string | null): Ev3Estado {
  const [status, setStatus] = useState<Ev3Status | null>(null);
  const cancelledRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getEv3Status(sessionId, robot);
      if (!cancelledRef.current) setStatus(s);
    } catch (e) {
      if (!cancelledRef.current) {
        setStatus(prev => ({
          connected: false,
          ip: prev?.ip ?? '—',
          battery: prev?.battery ?? 0,
          motors: prev?.motors ?? [],
          sensors: prev?.sensors ?? [],
          // Los errores del backend llegan como CommandError ({ code, message }), no como Error de JS.
          alerts: [`Error de comunicación: ${(e as { message?: string } | null)?.message ?? String(e)}`],
          reachable: false,
        }));
      }
    }
  }, [sessionId, robot]);

  // La telemetría también la leen los bloques interactivos del chat.
  useEffect(() => { publishEv3Status(status); }, [status]);
  // el gemelo 3D se adelanta en cuanto hay robot, antes de que alguien lo abra
  useEffect(() => { precargar('ev3'); }, []);
  useEffect(() => () => publishEv3Status(null), []);

  useEffect(() => {
    cancelledRef.current = false;
    void refreshStatus();
    const it = window.setInterval(refreshStatus, POLL_MS);
    return () => { cancelledRef.current = true; window.clearInterval(it); };
  }, [refreshStatus]);

  const setSpeed = useCallback((port: string, speed: number) => {
    void setEv3Motor(sessionId, port, speed, robot).catch(e => console.error('[EV3] Error moviendo motor:', e));
  }, [sessionId, robot]);

  const stopAll = useCallback(async () => {
    await stopEv3Motors(sessionId, undefined, robot);
  }, [sessionId, robot]);

  return { status, setSpeed, stopAll };
}
