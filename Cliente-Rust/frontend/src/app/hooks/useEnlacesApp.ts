// hooks/useEnlacesApp.ts — escucha los enlaces laboremoto://… (con la app ya abierta o al arrancar por uno) y los aplica cuando
// hay sesión: abre la vista de Prácticas en la práctica pedida. Si el enlace llega antes de iniciar sesión, espera al login.
import { useEffect, useRef } from 'react';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { leerEnlaceApp, type EnlaceApp } from '../enlacesApp';
import { requestPracticeOpen } from '@/features/practicas/practiceNavigation.service';

export function useEnlacesApp(isAuthenticated: boolean, abrirPracticas: () => void) {
  const pendiente = useRef<EnlaceApp | null>(null);
  const abrirRef = useRef(abrirPracticas);
  abrirRef.current = abrirPracticas;
  const autenticado = useRef(isAuthenticated);
  autenticado.current = isAuthenticated;

  const aplicar = (e: EnlaceApp) => {
    requestPracticeOpen(e.id);
    abrirRef.current();
  };

  useEffect(() => {
    const recibir = (urls: string[] | null | undefined) => {
      for (const u of urls ?? []) {
        const enlace = leerEnlaceApp(u);
        if (!enlace) { console.warn('[enlaces] enlace no reconocido, se ignora'); continue; }
        if (autenticado.current) aplicar(enlace); else pendiente.current = enlace;
      }
    };
    let quitar: (() => void) | null = null;
    let activo = true;
    // Enlace con el que se lanzó la app (arranque en frío) y los que lleguen después (la instancia única los reenvía).
    getCurrent().then(recibir).catch((e) => console.warn('[enlaces] no se pudo leer el enlace de arranque:', e));
    onOpenUrl(recibir).then((f) => { if (activo) quitar = f; else f(); }).catch((e) => console.warn('[enlaces] no se pudo escuchar enlaces:', e));
    return () => { activo = false; quitar?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAuthenticated && pendiente.current) {
      const e = pendiente.current;
      pendiente.current = null;
      aplicar(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}
