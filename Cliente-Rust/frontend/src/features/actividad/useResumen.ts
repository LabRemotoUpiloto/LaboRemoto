// features/actividad/useResumen.ts — carga el resumen de una pestaña de Actividad, lo refresca solo y al pedirlo.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Los comandos devuelven CommandError ({ message }) o un texto. */
export const mensajeDe = (e: unknown) => (e as { message?: string })?.message ?? String(e);

/** Lo mínimo que dura «Actualizando…»: si el broker responde al instante, que igual se alcance a ver que se volvió a pedir. */
const MINIMO_VISIBLE_MS = 600;

/**
 * @param pedir      la consulta al backend para un período en días
 * @param refrescoMs cada cuánto se vuelve a pedir solo (sin refresco si se omite)
 * @returns además de los datos, `recargar()`: vuelve a pedir al backend y resuelve `true` si llegaron datos nuevos,
 *          `false` si falló y `null` si otra carga más nueva (otro período) la reemplazó.
 */
export function useResumen<T>(pedir: (dias: number) => Promise<T>, dias: number, refrescoMs?: number) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());
  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;
  // Solo vale la respuesta de la última carga: si cambias de período a mitad de una, la vieja no pisa a la nueva.
  const turno = useRef(0);
  const enCurso = useRef(false);

  const cargar = useCallback(async (minimoMs = 0): Promise<boolean | null> => {
    const mio = ++turno.current;
    enCurso.current = true;
    const [r] = await Promise.allSettled([pedirRef.current(dias), new Promise((ok) => setTimeout(ok, minimoMs))]);
    if (mio !== turno.current) return null;
    enCurso.current = false;
    if (r.status === 'fulfilled') {
      setDatos(r.value);
      setAhora(Date.now());
      setError(null);
    } else {
      setError(mensajeDe(r.reason));
    }
    setCargando(false);
    return r.status === 'fulfilled';
  }, [dias]);

  useEffect(() => {
    setCargando(true);
    void cargar();
    if (!refrescoMs) return;
    // el refresco automático no interrumpe una carga en curso (la pedida a mano o la de un período nuevo)
    const t = setInterval(() => { if (!enCurso.current) void cargar(); }, refrescoMs);
    return () => clearInterval(t);
  }, [cargar, refrescoMs]);

  const recargar = useCallback(() => {
    setCargando(true);
    return cargar(MINIMO_VISIBLE_MS);
  }, [cargar]);

  return { datos, error, cargando, ahora, recargar };
}
