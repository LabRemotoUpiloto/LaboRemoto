import { useCallback, useState } from 'react';
import {
  cargarProgreso,
  guardarProgreso,
  marcarPasoCompletado,
  pasoCompletado as pasoCompletadoDe,
  contarPasosCompletados as contarPasosCompletadosDe,
  moduloCompletado as moduloCompletadoDe,
} from '../../lib/aprendizaje/progreso.js';

/**
 * Progreso del estudiante, como estado de React sincronizado con
 * `localStorage`. Se lee una sola vez al montar (lazy initializer de
 * `useState`) y cada cambio se persiste de inmediato.
 */
export function useProgreso() {
  const [progreso, setProgreso] = useState(() => cargarProgreso());

  const completarPaso = useCallback((moduloId, pasoId) => {
    setProgreso(prev => {
      const nuevo = marcarPasoCompletado(prev, moduloId, pasoId);
      guardarProgreso(nuevo);
      return nuevo;
    });
  }, []);

  return {
    progreso,
    completarPaso,
    pasoCompletado: (moduloId, pasoId) => pasoCompletadoDe(progreso, moduloId, pasoId),
    contarPasosCompletados: (moduloId, pasosIds) => contarPasosCompletadosDe(progreso, moduloId, pasosIds),
    moduloCompletado: (moduloId, pasosIds) => moduloCompletadoDe(progreso, moduloId, pasosIds),
  };
}
