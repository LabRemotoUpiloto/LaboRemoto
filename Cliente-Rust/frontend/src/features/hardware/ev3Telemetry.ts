/**
 * Última telemetría del robot EV3, compartida entre el Panel EV3 (que hace el
 * sondeo, ver Ev3Panel.tsx) y los bloques interactivos del chat (p. ej.
 * `sensor_demo`, que muestra el valor real del sensor junto a la simulación).
 * Así el chat no hace una segunda consulta al robot por el mismo SSH.
 *
 * Es un almacén mínimo con `useSyncExternalStore`; sin sesión de robot abierta
 * el valor es `null`.
 */
import { useSyncExternalStore } from 'react';
import type { Ev3Status } from './ev3.service';

let current: Ev3Status | null = null;
const listeners = new Set<() => void>();

/** El Panel EV3 publica cada lectura; al cerrarse publica `null`. */
export function publishEv3Status(status: Ev3Status | null): void {
  current = status;
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Telemetría más reciente del robot, o `null` si no hay panel abierto. */
export function useEv3Status(): Ev3Status | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
