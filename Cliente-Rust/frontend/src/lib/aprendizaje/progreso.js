/**
 * Progreso del estudiante en los módulos de aprendizaje.
 *
 * No hay backend de usuarios en este proyecto, así que el progreso vive en
 * el `localStorage` del navegador: es por dispositivo/navegador, no por
 * persona. Suficiente para un laboratorio remoto donde cada estudiante
 * entra desde su propia máquina.
 *
 * Las funciones de transformación (`marcarPasoCompletado`, `pasoCompletado`,
 * `moduloCompletado`) son puras y no tocan `localStorage` — solo
 * `cargarProgreso`/`guardarProgreso` lo hacen, y con `try/catch` porque
 * `localStorage` puede no estar disponible (navegación privada, cuota
 * llena, o directamente no existir en el entorno de tests).
 */

const CLAVE_STORAGE = 'ev3_aprendizaje_progreso';

/** @returns {{ modulos: Record<string, { pasos: Record<string, boolean> }> }} */
export function progresoVacio() {
  return { modulos: {} };
}

/** Lee el progreso guardado, o uno vacío si no hay nada (o algo salió mal). */
export function cargarProgreso() {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    if (!crudo) return progresoVacio();
    const parsed = JSON.parse(crudo);
    return parsed && typeof parsed === 'object' && parsed.modulos ? parsed : progresoVacio();
  } catch {
    return progresoVacio();
  }
}

/** Persiste el progreso. Si `localStorage` no está disponible, no hace nada. */
export function guardarProgreso(progreso) {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(progreso));
  } catch {
    // Sin almacenamiento disponible: el progreso simplemente no persiste
    // entre sesiones, pero la app sigue funcionando dentro de esta sesión.
  }
}

/**
 * Devuelve un nuevo objeto de progreso con `pasoId` marcado como completado
 * dentro de `moduloId`. No muta `progreso`.
 */
export function marcarPasoCompletado(progreso, moduloId, pasoId) {
  const moduloActual = progreso.modulos[moduloId] ?? { pasos: {} };
  return {
    ...progreso,
    modulos: {
      ...progreso.modulos,
      [moduloId]: { ...moduloActual, pasos: { ...moduloActual.pasos, [pasoId]: true } },
    },
  };
}

/** @returns {boolean} si `pasoId` de `moduloId` ya se completó. */
export function pasoCompletado(progreso, moduloId, pasoId) {
  return !!progreso.modulos[moduloId]?.pasos?.[pasoId];
}

/** @returns {number} cuántos de `pasosIds` ya se completaron en `moduloId`. */
export function contarPasosCompletados(progreso, moduloId, pasosIds) {
  return pasosIds.filter(id => pasoCompletado(progreso, moduloId, id)).length;
}

/** @returns {boolean} si TODOS los `pasosIds` de `moduloId` están completos. */
export function moduloCompletado(progreso, moduloId, pasosIds) {
  return pasosIds.length > 0 && pasosIds.every(id => pasoCompletado(progreso, moduloId, id));
}
