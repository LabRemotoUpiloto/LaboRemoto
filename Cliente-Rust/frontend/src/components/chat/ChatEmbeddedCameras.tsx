import React, { useEffect } from 'react';
import { ActionIcon, Loader } from '@mantine/core';
import { Video, X } from 'lucide-react';
import CameraGrid from '../raspberry/CameraGrid';
import './ChatEmbeddedCameras.css';

type Props = {
  sessionId: string | null;
  sessionConnecting?: boolean;
  sessionError?: string | null;
  label?: string;
  onClose?: () => void;
};

const ChatEmbeddedCameras: React.FC<Props> = ({
  sessionId,
  sessionConnecting = false,
  sessionError = null,
  label = 'Cámaras · Raspberry Pi 4',
  onClose,
}) => {
  useEffect(() => {
    const t1 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    const t2 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [sessionId]);

  if (!sessionId && !sessionConnecting && !sessionError) return null;

  return (
    <div className="chat-embedded-cameras" role="region" aria-label="Cámaras Raspberry Pi en el chat">
      <div className="chat-embedded-cameras__header">
        <Video size={14} className="chat-embedded-cameras__icon" strokeWidth={2.5} />
        <span className="chat-embedded-cameras__title">{label}</span>
        <span className="chat-embedded-cameras__hint">
          {sessionConnecting ? 'Conectando SSH…' : 'Streams activos de la Pi4'}
        </span>
        {onClose && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar cámaras"
            className="chat-embedded-cameras__close"
          >
            <X size={14} />
          </ActionIcon>
        )}
      </div>
      {sessionError && !sessionId && (
        <p className="chat-embedded-cameras__error">{sessionError}</p>
      )}
      <div className="chat-embedded-cameras__body">
        {sessionConnecting && !sessionId && (
          <div className="chat-embedded-cameras__loading">
            <Loader size="sm" color="blue" />
            <span>Conectando a la Raspberry…</span>
          </div>
        )}
        {sessionId && (
          <ChatCameraGridHost sessionId={sessionId} />
        )}
      </div>
    </div>
  );
};

/** Inicia el grid al montar y detiene el port-forward al desmontar. */
function ChatCameraGridHost({ sessionId }: { sessionId: string }) {
  return <CameraGrid sessionId={sessionId} isActive autoStart />;
}

export default ChatEmbeddedCameras;
