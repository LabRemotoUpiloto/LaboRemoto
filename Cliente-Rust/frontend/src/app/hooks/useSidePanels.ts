/**
 * useSidePanels.ts
 *
 * Gestiona el estado de los paneles laterales deslizantes de la app:
 * - Panel de Pines GPIO (Raspberry Pi)
 * - Panel de cámara (bottom bar)
 * - Panel de Domótica (Arduino)
 *
 * También centraliza la emisión de CustomEvents necesarios para que los
 * componentes de layout se animen correctamente al abrir/cerrar paneles.
 *
 * Extraído de App.tsx.
 */

import { useState } from 'react';

// Emite un CustomEvent en 3 momentos: inicio, siguiente frame, y después de la animación.
// Esto permite que los componentes de layout respondan a la animación de apertura/cierre.
function emitPhased(eventName: string, detail: object, animationDurationMs = 320) {
  const fire = (phase: string) => {
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, phase } }));
    } catch { /* nunca debería fallar, pero por seguridad */ }
  };

  fire('start');
  requestAnimationFrame(() => fire('frame'));
  setTimeout(() => fire('end'), animationDurationMs);
}

export function useSidePanels() {
  const [isPinsPanelOpen, setPinsPanelOpen] = useState(false);
  const [cameraOpenBySession, setCameraOpenBySession] = useState<Record<string, boolean>>({});
  const [isDomoticaPanelOpen, setDomoticaPanelOpen] = useState(false);

  // ── Pins GPIO ────────────────────────────────────────────────────────────────

  const togglePinsPanel = () => {
    setPinsPanelOpen(prev => {
      const next = !prev;
      emitPhased('app:pins-toggled', { isOpen: next });
      return next;
    });
  };

  const closePinsPanel = () => {
    setPinsPanelOpen(prev => {
      if (!prev) return prev;
      emitPhased('app:pins-toggled', { isOpen: false });
      return false;
    });
  };

  // ── Cámara (bottom bar) ───────────────────────────────────────────────────────

  const isCameraOpen = (sessionId: string | null | undefined) => Boolean(sessionId && cameraOpenBySession[sessionId]);

  const setCameraPanelOpen = (sessionId: string, isOpen: boolean) => {
    setCameraOpenBySession(prev => {
      if (prev[sessionId] === isOpen) return prev;
      emitPhased('app:bottombar-toggled', { isOpen });
      return { ...prev, [sessionId]: isOpen };
    });
  };

  const toggleCameraPanel = (sessionId: string) => {
    setCameraPanelOpen(sessionId, !isCameraOpen(sessionId));
  };

  const closeCameraPanel = (sessionId: string) => {
    setCameraPanelOpen(sessionId, false);
  };

  // ── Domótica Arduino ──────────────────────────────────────────────────────────

  const toggleDomoticaPanel = () => setDomoticaPanelOpen(prev => !prev);
  const closeDomoticaPanel = () => setDomoticaPanelOpen(false);

  // ── Cerrar todos los paneles (ej. al cambiar de tab) ─────────────────────────

  const closeAllPanels = () => {
    closePinsPanel();
    closeDomoticaPanel();
  };

  return {
    isPinsPanelOpen,
    isCameraOpen,
    isDomoticaPanelOpen,
    togglePinsPanel,
    closePinsPanel,
    toggleCameraPanel,
    closeCameraPanel,
    setCameraPanelOpen,
    toggleDomoticaPanel,
    closeDomoticaPanel,
    closeAllPanels,
  };
}
