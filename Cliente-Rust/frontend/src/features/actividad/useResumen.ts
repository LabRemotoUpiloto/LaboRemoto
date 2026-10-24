// features/actividad/useResumen.ts — carga el resumen de una pestaña de Actividad, lo refresca solo y al pedirlo.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Los comandos devuelven CommandError ({ message }) o un texto. */
export const mensajeDe = (e: unknown) => (e as { message?: string })?.message ?? String(e);

/**
 * @param pedir     la consulta al backend para un período en días
 * @param recarga   cambia cuando el encabezado pide «Actualizar»
 * @param refrescoMs cada cuánto se vuelve a pedir solo (sin refresco si se omite)
 */
export function useResumen<T>(pedir: (dias: number) => Promise<T>, dias: number, recarga: number, refrescoMs?: number) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());
  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;

  const cargar = useCallback(async () => {
    try {
      setDatos(await pedirRef.current(dias));
      setAhora(Date.now());
      setError(null);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => {
    setCargando(true);
    void cargar();
    if (!refrescoMs) return;
    const t = setInterval(() => void cargar(), refrescoMs);
    return () => clearInterval(t);
  }, [cargar, refrescoMs, recarga]);

  return { datos, error, cargando, ahora };
}
