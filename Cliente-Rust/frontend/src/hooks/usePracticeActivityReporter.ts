// hooks/usePracticeActivityReporter.ts — reporta al registro central de
// sesiones (broker, ver cmd::sesiones) el inicio de cada práctica abierta, un
// latido por minuto mientras siga abierta y el fin al cerrarla. Si la app se
// cierra de golpe no llega el fin: el broker la da por terminada al dejar de
// recibir latidos.
import { useEffect, useRef } from 'react';
import { sesionesService } from '../services/sesiones.service';
import { obtenerUbicacionDispositivo } from '../utils/ubicacionDispositivo';

const LATIDO_MS = 60_000;

export interface PracticaAbierta {
  practiceId: string;
  nombre: string;
}

// El registro es informativo: un fallo nunca debe interrumpir la práctica.
const avisar = (e: unknown) => console.warn('[sesiones] no se pudo reportar el evento:', e);

// La ubicación va aparte y después del inicio: pedirla puede tardar (o
// mostrarle un permiso al estudiante) y el inicio no debe esperar por eso.
async function reportarInicio(id: string, practicaId: string, practicaNombre: string) {
  await sesionesService.reportarEvento('inicio', id, { practicaId, practicaNombre });
  const ubicacion = await obtenerUbicacionDispositivo();
  if (ubicacion) await sesionesService.reportarEvento('ubicacion', id, ubicacion);
}

/** `abiertas`: sessionId SSH -> práctica. `enabled`: hay sesión de Keycloak. */
export function usePracticeActivityReporter(abiertas: Record<string, PracticaAbierta>, enabled: boolean) {
  const reportadas = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) {
      // Sin token no hay a quién atribuirlas; el broker las cierra por latido.
      reportadas.current.clear();
      return;
    }
    for (const [id, { practiceId, nombre }] of Object.entries(abiertas)) {
      if (reportadas.current.has(id)) continue;
      reportadas.current.add(id);
      reportarInicio(id, practiceId, nombre).catch(avisar);
    }
    for (const id of [...reportadas.current]) {
      if (id in abiertas) continue;
      reportadas.current.delete(id);
      sesionesService.reportarEvento('fin', id).catch(avisar);
    }
  }, [abiertas, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      for (const id of reportadas.current) sesionesService.reportarEvento('latido', id).catch(avisar);
    }, LATIDO_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
