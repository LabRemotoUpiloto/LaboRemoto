/**
 * SidePanel.tsx
 *
 * Panel lateral deslizante genérico (GPIO, Domótica, etc.)
 * Antes duplicado directamente en App.tsx — ahora componente reutilizable.
 */

import React from 'react';

interface SidePanelProps {
  title: string;
  ariaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}

const SidePanel: React.FC<SidePanelProps> = ({ title, ariaLabel, onClose, children }) => {
  return (
    <aside className="pins-panel" aria-label={ariaLabel}>
      <div className="pins-panel__header">
        <span className="pins-panel__title">{title}</span>
        <button
          className="pins-panel__close-button"
          onClick={onClose}
          title="Cerrar panel"
          aria-label={`Cerrar ${title}`}
        >
          ×
        </button>
      </div>
      <div className="pins-panel__content">
        {children}
      </div>
    </aside>
  );
};

export default SidePanel;
