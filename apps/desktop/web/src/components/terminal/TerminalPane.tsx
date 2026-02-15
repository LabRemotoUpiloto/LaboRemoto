import React, { useRef } from 'react';
import 'xterm/css/xterm.css';
import './TerminalPane.css';
import { useTheme } from '../../contexts/ThemeContext';
import { useTerminal } from './useTerminal';

type Props = { sessionId: string | null };

const TerminalPane: React.FC<Props> = ({ sessionId }) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isLoading } = useTerminal(sessionId, containerRef, theme);

  return (
    <div className="terminal-pane" ref={containerRef}>
      {isLoading && sessionId && (
        <div className="terminal-loading-overlay">
          <div className="terminal-loading-spinner"></div>
          <div className="terminal-loading-text">Conectando al servidor...</div>
        </div>
      )}
    </div>
  );
};

export default TerminalPane;
