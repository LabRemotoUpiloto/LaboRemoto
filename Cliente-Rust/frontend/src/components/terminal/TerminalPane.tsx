import React, { useRef } from 'react';
import 'xterm/css/xterm.css';
import './TerminalPane.css';
import { useTheme } from '../../contexts/ThemeContext';
import { useTerminal } from './useTerminal';

type Props = {
  sessionId: string | null;
  onTerminalOutput?: (data: string) => void;
  onTerminalInput?: (data: string) => void;
  localSshCommand?: string | null;
};

const TerminalPane: React.FC<Props> = ({ sessionId, onTerminalOutput, onTerminalInput, localSshCommand }) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isLoading, isFadingOut, waitingForPrompt } = useTerminal(
    sessionId, containerRef, theme, onTerminalOutput, onTerminalInput, localSshCommand,
  );

  return (
    <div className="terminal-pane" ref={containerRef}>
      {isLoading && sessionId && (
        <div className={`terminal-loading-overlay${isFadingOut ? ' terminal-loading-overlay--fade-out' : ''}`}>
          <div className="terminal-loading-spinner"></div>
          <div className="terminal-loading-text">
            {waitingForPrompt
              ? 'Esperando respuesta del servidor...'
              : 'Conectando al servidor...'}
          </div>
          {waitingForPrompt && (
            <div className="terminal-loading-subtext">
              Solicitando el prompt del shell
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TerminalPane;
