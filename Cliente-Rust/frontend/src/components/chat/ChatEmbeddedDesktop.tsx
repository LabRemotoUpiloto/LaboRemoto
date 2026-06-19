import React, { useEffect } from 'react';
import { ActionIcon, Loader } from '@mantine/core';
import { Monitor, X } from 'lucide-react';
import DesktopPane from '../desktop/DesktopPane';
import './ChatEmbeddedDesktop.css';

type Props = {
  sessionId: string | null;
  sessionConnecting?: boolean;
  sessionError?: string | null;
  label?: string;
  onClose?: () => void;
};

const ChatEmbeddedDesktop: React.FC<Props> = ({
  sessionId,
  sessionConnecting = false,
  sessionError = null,
  label = 'Escritorio · Raspberry Pi 4',
  onClose,
}) => {
  useEffect(() => {
    const t1 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    const t2 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    const t3 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [sessionId]);

  if (!sessionId && !sessionConnecting && !sessionError) return null;

  return (
    <div className="chat-embedded-desktop" role="region" aria-label="Escritorio remoto Raspberry Pi en el chat">
      <div className="chat-embedded-desktop__header">
        <Monitor size={14} className="chat-embedded-desktop__icon" strokeWidth={2.5} />
        <span className="chat-embedded-desktop__title">{label}</span>
        <span className="chat-embedded-desktop__hint">
          {sessionConnecting ? 'Conectando SSH…' : 'Escritorio LXDE vía VNC (mismo que el botón Escritorio remoto)'}
        </span>
        {onClose && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar escritorio"
            className="chat-embedded-desktop__close"
          >
            <X size={14} />
          </ActionIcon>
        )}
      </div>
      {sessionError && !sessionId && (
        <p className="chat-embedded-desktop__error">{sessionError}</p>
      )}
      <div className="chat-embedded-desktop__body">
        {sessionConnecting && !sessionId && (
          <div className="chat-embedded-desktop__loading">
            <Loader size="sm" color="blue" />
            <span>Conectando a la Raspberry…</span>
          </div>
        )}
        {sessionId && <DesktopPane sessionId={sessionId} isActive />}
      </div>
    </div>
  );
};

export default ChatEmbeddedDesktop;
