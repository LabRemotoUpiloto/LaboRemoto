// tours/tour_linux/TourPracticaLinux.tsx — arranca el tour de la práctica la primera vez que un
// estudiante entra a UN módulo de Linux puntual. A diferencia de BienvenidaTutorial.tsx, no ofrece un
// modal de "¿quieres verlo?": arranca directo (el estudiante ya decidió entrar a la práctica), y el
// propio tour se puede cerrar con la X si no se quiere ver.
import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useEffectiveRole, rolVerComo } from '../../hooks/usePermissions';
import { iniciarTourPracticaLinux, marcarTourPracticaLinuxVisto, tourPracticaLinuxYaVisto } from './tutorialPracticaLinux';

/** Evento disparado por useLinuxPracticeSession al conectar un módulo (ver connect() ahí). */
export const EVENTO_TOUR_PRACTICA_LINUX = 'app:tour-practica-linux';

export interface DetalleTourPracticaLinux {
  moduleId: string;
  /** Los módulos Eve3 reusan el mismo hook pero este tour, por ahora, es solo para Linux. */
  esEv3: boolean;
}

export default function TourPracticaLinux() {
  const { isAuthenticated, user } = useAuth();
  const rol = useEffectiveRole();
  const usuario = user?.preferred_username ?? '';

  useEffect(() => {
    const alConectar = (e: Event) => {
      const detalle = (e as CustomEvent<DetalleTourPracticaLinux>).detail;
      if (!detalle || detalle.esEv3) return; // por ahora, solo prácticas de Linux
      if (!isAuthenticated || !usuario || rol !== 'estudiante') return;
      // "Ver como" (solo desarrollo, ver usePermissions.ts) es justo para esto: probar el tour las
      // veces que haga falta sin que el "ya visto" se interponga. Un estudiante real (sin esa opción,
      // o en producción) sigue viéndolo una sola vez por módulo.
      const previsualizando = import.meta.env.DEV && rolVerComo() !== null;
      if (!previsualizando && tourPracticaLinuxYaVisto(usuario, detalle.moduleId)) return;
      // Un instante para que el panel de chat/terminal recién abierto termine de montarse y animarse.
      const t = setTimeout(() => {
        if (!previsualizando) marcarTourPracticaLinuxVisto(usuario, detalle.moduleId);
        iniciarTourPracticaLinux();
      }, 600);
      return () => clearTimeout(t);
    };
    window.addEventListener(EVENTO_TOUR_PRACTICA_LINUX, alConectar);
    return () => window.removeEventListener(EVENTO_TOUR_PRACTICA_LINUX, alConectar);
  }, [isAuthenticated, usuario, rol]);

  return null;
}
