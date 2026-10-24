import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Selección múltiple genérica por path (string), reutilizada por
 * useLocalFsBrowser y useRemoteFsBrowser. Emula el comportamiento estándar
 * de exploradores de archivos:
 *  - Clic simple: selección única.
 *  - Ctrl/Cmd+clic: alterna un elemento dentro de la selección.
 *  - Shift+clic: selecciona el rango entre el último "ancla" y el elemento
 *    clicado, calculado sobre un orden explícito (normalmente el orden
 *    visible/mostrado, no el DOM).
 *  - Ctrl/Cmd+A: selecciona todo.
 *  - Escape / clic en vacío: deselecciona todo.
 */
export function useMultiSelection() {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  // "Ancla" usada como punto de partida para selección por rango (Shift+clic).
  const anchorRef = useRef<string | undefined>(undefined);

  const selectOnly = useCallback((path: string) => {
    anchorRef.current = path;
    setSelectedPaths(new Set([path]));
  }, []);

  const toggleSelect = useCallback((path: string) => {
    anchorRef.current = path;
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectRange = useCallback((anchor: string, to: string, orderedPaths: string[]) => {
    const ai = orderedPaths.indexOf(anchor);
    const ti = orderedPaths.indexOf(to);
    if (ai === -1 || ti === -1) {
      anchorRef.current = to;
      setSelectedPaths(new Set([to]));
      return;
    }
    const [start, end] = ai <= ti ? [ai, ti] : [ti, ai];
    setSelectedPaths(new Set(orderedPaths.slice(start, end + 1)));
    // El ancla se mantiene fija durante shifts sucesivos.
  }, []);

  const selectAll = useCallback((paths: string[]) => {
    setSelectedPaths(new Set(paths));
    if (paths.length > 0) anchorRef.current = paths[paths.length - 1];
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    anchorRef.current = undefined;
  }, []);

  // Derivado de compatibilidad: el "último seleccionado" (ancla vigente si
  // sigue formando parte de la selección; si no, cualquier elemento restante).
  const lastSelected = useMemo(() => {
    if (selectedPaths.size === 0) return undefined;
    if (anchorRef.current && selectedPaths.has(anchorRef.current)) return anchorRef.current;
    return Array.from(selectedPaths)[selectedPaths.size - 1];
  }, [selectedPaths]);

  return {
    selectedPaths,
    setSelectedPaths,
    lastSelected,
    selectOnly,
    toggleSelect,
    selectRange,
    selectAll,
    clearSelection,
  };
}

export type MultiSelection = ReturnType<typeof useMultiSelection>;
