// features/actividad/useUbicacionAppReporter.ts — mientras haya sesión, avisa al broker dónde está el equipo (al entrar y cada pocos minutos),
// sin necesidad de una práctica abierta. Así las conexiones SSH de esta misma IP (pestaña Dispositivos de Actividad) salen con la
// ubicación real del equipo y no con la aproximada por IP. La ubicación ya sale redondeada (~110 m) de obtenerUbicacionDispositivo.
import { useEffect } from 'react';
import { sesionesService } from './sesiones.service';
import { obtenerUbicacionDispositivo } from './ubicacionDispositivo';

const CADA_MS = 5 * 60_000;

export function useUbicacionAppReporter(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let activo = true;
    const avisar = async () => {
      const u = await obtenerUbicacionDispositivo();
      if (!activo || !u) return;
      await sesionesService.reportarUbicacionApp(u.lat, u.lon, u.precisionM);
    };
    // Informativo: un fallo (sin permiso, sin red) nunca debe molestar al usuario.
    const intentar = () => { avisar().catch((e) => console.warn('[ubicacion] no se pudo avisar:', e)); };
    intentar();
    const timer = setInterval(intentar, CADA_MS);
    return () => { activo = false; clearInterval(timer); };
  }, [enabled]);
}
