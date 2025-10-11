import React, { useEffect } from 'react';
import './BottomBar.css';
import CameraPanel from './CameraPanel';
import PinsPanel from './PinsPanel';

interface BottomBarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessionId: string;
}

// Barra inferior plegable con dos paneles vacíos por ahora
const BottomBar: React.FC<BottomBarProps> = ({ isOpen, onToggle, sessionId }) => {
  // Enviar eventos como la sidebar para que el terminal se reajuste
  const emitTogglePhases = (nextOpen: boolean) => {
    try { window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { isOpen: nextOpen, phase: 'start' } })) } catch {}
    try { requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { isOpen: nextOpen, phase: 'frame' } }))) } catch {}
    try { window.setTimeout(() => window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { isOpen: nextOpen, phase: 'end' } })), 320) } catch {}
  };

  useEffect(() => {
    // Al montar, no emite. Solo cuando cambie por interacción del usuario.
  }, []);

  const handleToggle = () => {
    emitTogglePhases(!isOpen);
    onToggle();
  };

  return (
    <div className={`bottom-bar ${isOpen ? 'open' : 'closed'}`}>
      <button
        type="button"
        className={`bb-toggle ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="bottom-bar-content"
        title={isOpen ? 'Cerrar barra inferior' : 'Abrir barra inferior'}
      >
        <span className="bb-caret" aria-hidden>⌄</span>
        <span className="bb-label">Barra inferior</span>
      </button>
      <div id="bottom-bar-content" className="bb-content" aria-hidden={!isOpen}>
        <div className="bb-panels">
          <div className="bb-panel camera-panel" aria-label="Panel de cámara">
            <CameraPanel />
          </div>
          <div className="bb-panel pins-panel" aria-label="Panel de pines Raspberry Pi">
            <PinsPanel sessionId={sessionId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BottomBar;
