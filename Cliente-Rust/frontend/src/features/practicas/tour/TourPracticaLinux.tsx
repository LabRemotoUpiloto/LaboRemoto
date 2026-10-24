// features/practicas/tour/TourPracticaLinux.tsx — arranca el tour de la práctica CADA VEZ que un estudiante
// entra a un módulo de Linux (no solo la primera). A diferencia de BienvenidaTutorial.tsx, no ofrece un
// modal de "¿quieres verlo?" ni se puede cerrar con la X: arranca directo y termina con «¡Listo!».
import { useEffect } from 'react';
import { useAuth } from '@/features/cuenta/AuthContext';
import { useEffectiveRole } from '@/features/cuenta/usePermissions';
import { iniciarTourPracticaLinux } from './tutorialPracticaLinux';

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
      // Un instante para que el panel de chat/terminal recién abierto termine de montarse y animarse.
      const t = setTimeout(() => iniciarTourPracticaLinux(), 600);
      return () => clearTimeout(t);
    };
    window.addEventListener(EVENTO_TOUR_PRACTICA_LINUX, alConectar);
    return () => window.removeEventListener(EVENTO_TOUR_PRACTICA_LINUX, alConectar);
  }, [isAuthenticated, usuario, rol]);

  return null;
}
