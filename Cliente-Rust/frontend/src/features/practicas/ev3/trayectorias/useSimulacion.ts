// features/practicas/ev3/trayectorias/useSimulacion.ts — reproducción de la ruta en el lienzo: avanza el tiempo con
// requestAnimationFrame y da la pose del robot y el comando activo. simulador.ts queda puro y probable sin DOM.
import { useEffect, useMemo, useRef, useState } from 'react';
import { construirLineaDeTiempo, duracionTotalMs, poseEnInstante } from './simulador';
import type { Pose, Primitiva } from './tipos';

export interface Simulacion {
  reproduciendo: boolean;
  tiempoMs: number;
  totalMs: number;
  velocidad: number;
  setVelocidad: (v: number) => void;
  pose: Pose;
  indiceActivo: number | null;
  alternar: () => void;
  irA: (ms: number) => void;
  pasoAdelante: () => void;
  pasoAtras: () => void;
  detener: () => void;
}

export function useSimulacion(primitivas: Primitiva[]): Simulacion {
  const [reproduciendo, setReproduciendo] = useState(false);
  const [tiempoMs, setTiempoMs] = useState(0);
  const [velocidad, setVelocidad] = useState(1);
  const ultimoFrame = useRef(0);

  const lineaDeTiempo = useMemo(() => construirLineaDeTiempo(primitivas), [primitivas]);
  const totalMs = duracionTotalMs(lineaDeTiempo);

  // Si la ruta se acortó mientras estaba en pausa, el cabezal no queda más allá del final.
  useEffect(() => { setTiempoMs((t) => Math.min(t, totalMs)); }, [totalMs]);

  useEffect(() => {
    if (!reproduciendo) return undefined;
    // Con «reducir movimiento» la animación salta al final en vez de recorrer la ruta.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTiempoMs(totalMs);
      return undefined;
    }
    let frame = 0;
    ultimoFrame.current = performance.now();
    const tick = (ahora: number) => {
      const delta = ahora - ultimoFrame.current;
      ultimoFrame.current = ahora;
      setTiempoMs((t) => t + delta * velocidad);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reproduciendo, velocidad, totalMs]);

  // Al llegar al final se pausa y el cabezal queda justo en el final (cada cuadro puede pasarse unos ms).
  useEffect(() => {
    if (reproduciendo && tiempoMs >= totalMs) {
      setReproduciendo(false);
      setTiempoMs(totalMs);
    }
  }, [tiempoMs, totalMs, reproduciendo]);

  const { pose, indiceActivo } = poseEnInstante(lineaDeTiempo, tiempoMs);

  const irA = (ms: number) => {
    setReproduciendo(false);
    setTiempoMs(Math.min(Math.max(ms, 0), totalMs));
  };

  const pasoAdelante = () => {
    setReproduciendo(false);
    const siguiente = lineaDeTiempo[(indiceActivo ?? -1) + 1];
    setTiempoMs(siguiente ? siguiente.inicioMs : totalMs);
  };

  // Si ya está al inicio del paso actual, vuelve al anterior; si no, al inicio del paso en curso.
  const pasoAtras = () => {
    setReproduciendo(false);
    const actual = indiceActivo === null ? undefined : lineaDeTiempo[indiceActivo];
    if (actual && tiempoMs > actual.inicioMs + 1) {
      setTiempoMs(actual.inicioMs);
    } else {
      const anterior = lineaDeTiempo[(indiceActivo ?? lineaDeTiempo.length) - 1];
      setTiempoMs(anterior ? anterior.inicioMs : 0);
    }
  };

  const detener = () => {
    setReproduciendo(false);
    setTiempoMs(0);
  };

  return {
    reproduciendo,
    tiempoMs,
    totalMs,
    velocidad,
    setVelocidad,
    pose,
    indiceActivo,
    alternar: () => {
      // Al final de la ruta, «Reproducir» vuelve a empezar.
      if (!reproduciendo && tiempoMs >= totalMs) setTiempoMs(0);
      setReproduciendo((r) => !r);
    },
    irA,
    pasoAdelante,
    pasoAtras,
    detener,
  };
}
