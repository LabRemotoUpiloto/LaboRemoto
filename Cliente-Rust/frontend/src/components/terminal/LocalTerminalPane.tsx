import React, { useRef } from 'react';
import 'xterm/css/xterm.css';
import './TerminalPane.css';
import { useTheme } from '../../contexts/ThemeContext';
import { useLocalTerminal } from './useLocalTerminal';

type Props = {
  paneId: string;
  isActive?: boolean;
};

/** Leaf component de un panel de terminal local — mirror de TerminalPane.tsx. */
const LocalTerminalPane: React.FC<Props> = ({ paneId, isActive = true }) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isLoading, hasExited } = useLocalTerminal(paneId, containerRef, theme, isActive);

  return (
    <div className="terminal-pane" ref={containerRef}>
      {isLoading && (
        <div className="terminal-loading-overlay">
          <div className="terminal-loading-spinner"></div>
          <div className="terminal-loading-text">Iniciando terminal local...</div>
        </div>
      )}
      {hasExited && !isLoading && (
        <div className="local-terminal-exited-badge">Proceso finalizado</div>
      )}
    </div>
  );
};

export default LocalTerminalPane;
