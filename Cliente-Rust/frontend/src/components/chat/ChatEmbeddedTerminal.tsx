import React, { useEffect } from 'react';
import { ActionIcon, Loader } from '@mantine/core';
import { X, Terminal } from 'lucide-react';
import TerminalPane from '../terminal/TerminalPane';
import './ChatEmbeddedTerminal.css';

type Props = {
  sessionId: string | null;
  sshCommandLine?: string | null;
  connecting?: boolean;
  error?: string | null;
  label?: string;
  onClose?: () => void;
  /** inline = bloque dentro del scroll de mensajes; docked = panel fijo (legacy) */
  variant?: 'inline' | 'docked';
};

const ChatEmbeddedTerminal: React.FC<Props> = ({
  sessionId,
  sshCommandLine = null,
  connecting = false,
  error = null,
  label = 'Raspberry Pi 4',
  onClose,
  variant = 'inline',
}) => {
  useEffect(() => {
    const t1 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    const t2 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [sessionId]);

  if (!sessionId && !connecting && !error) return null;

  return (
    <div
      className={`chat-embedded-terminal chat-embedded-terminal--${variant}`}
      role="region"
      aria-label="Terminal Raspberry Pi en el chat"
    >
      <div className="chat-embedded-terminal__header">
        <Terminal size={14} className="chat-embedded-terminal__icon" strokeWidth={2.5} />
        <span className="chat-embedded-terminal__title">{label}</span>
        <span className="chat-embedded-terminal__hint">
          {connecting
            ? 'Conectando…'
            : sshCommandLine
              ? `Comando: ${sshCommandLine}`
              : 'Escribe aquí; el agente puede leer esta terminal'}
        </span>
        {onClose && sessionId && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar terminal"
            className="chat-embedded-terminal__close"
          >
            <X size={14} />
          </ActionIcon>
        )}
      </div>
      {error && !sessionId && (
        <p className="chat-embedded-terminal__error">{error}</p>
      )}
      <div className="chat-embedded-terminal__body">
        {connecting && !sessionId && (
          <div className="chat-embedded-terminal__loading">
            <Loader size="sm" color="blue" />
          </div>
        )}
        {sessionId && (
          <TerminalPane sessionId={sessionId} localSshCommand={sshCommandLine} />
        )}
      </div>
    </div>
  );
};

export default ChatEmbeddedTerminal;
