// features/circuitos/tour/useTourPracticaCircuito.ts — arranca el tour de la práctica de circuitos cada vez que un
// estudiante la abre, igual que el de Linux (TourPracticaLinux.tsx): cuando el simulador ya está en pantalla.
import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/cuenta/AuthContext';
import { useEffectiveRole } from '@/features/cuenta/usePermissions';
import { iniciarTourPractica } from '@/features/practicas/tour/tutorialPracticaLinux';
import { CARPETA_TOUR_CIRCUITOS, PASOS_PRACTICA_CIRCUITOS } from './pasos';

export function useTourPracticaCircuito(simuladorListo: boolean) {
  const { isAuthenticated, user } = useAuth();
  const rol = useEffectiveRole();
  const usuario = user?.preferred_username ?? '';
  const mostrado = useRef(false);

  useEffect(() => {
    if (!simuladorListo || mostrado.current) return;
    if (!isAuthenticated || !usuario || rol !== 'estudiante') return;
    mostrado.current = true;
    // un instante para que el chat termine de montarse (la bienvenida y el paso en curso)
    const t = setTimeout(() => iniciarTourPractica({ pasos: PASOS_PRACTICA_CIRCUITOS, carpeta: CARPETA_TOUR_CIRCUITOS }), 600);
    return () => clearTimeout(t);
  }, [simuladorListo, isAuthenticated, usuario, rol]);
}
