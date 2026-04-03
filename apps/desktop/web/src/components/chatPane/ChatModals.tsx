import React from 'react';
import { ChatMode } from '../chatModes/types';
import { MODES } from './chatPane.constants';

interface Props {
  showModeConfirm: ChatMode | null;
  confirmModeSwitch: () => void;
  cancelModeSwitch: () => void;
  showShortcuts: boolean;
  setShowShortcuts: (v: boolean) => void;
}

const ChatModals: React.FC<Props> = ({
  showModeConfirm, confirmModeSwitch, cancelModeSwitch,
  showShortcuts, setShowShortcuts,
}) => (
  <>
    {showModeConfirm && (
      <div className="mode-confirm-overlay" onClick={cancelModeSwitch}>
        <div className="mode-confirm-dialog" onClick={e => e.stopPropagation()}>
          <p className="mode-confirm-text">
            Cambiar a <strong>{MODES.find(m => m.value === showModeConfirm)?.label}</strong> borrará los mensajes actuales.
          </p>
          <div className="mode-confirm-actions">
            <button className="mode-confirm-btn mode-confirm-btn--cancel" onClick={cancelModeSwitch}>Cancelar</button>
            <button className="mode-confirm-btn mode-confirm-btn--confirm" onClick={confirmModeSwitch}>Cambiar</button>
          </div>
        </div>
      </div>
    )}

    {showShortcuts && (
      <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
        <div className="shortcuts-dialog" onClick={e => e.stopPropagation()}>
          <div className="shortcuts-header">
            <span>Atajos de teclado</span>
            <button className="shortcuts-close" onClick={() => setShowShortcuts(false)}>×</button>
          </div>
          <ul className="shortcuts-list">
            <li><kbd>Enter</kbd><span>Enviar mensaje</span></li>
            <li><kbd>Shift+Enter</kbd><span>Nueva línea</span></li>
            <li><kbd>Esc</kbd><span>Cancelar respuesta en curso</span></li>
            <li><kbd>↑</kbd><span>Recuperar último mensaje enviado</span></li>
            <li><kbd>Ctrl+F</kbd><span>Buscar en mensajes</span></li>
            <li><kbd>Ctrl+N</kbd><span>Nuevo chat</span></li>
            <li><kbd>Shift+?</kbd><span>Mostrar / ocultar esta ayuda</span></li>
          </ul>
        </div>
      </div>
    )}
  </>
);

export default ChatModals;
