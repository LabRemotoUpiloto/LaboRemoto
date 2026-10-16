import React, { useEffect } from 'react';
import { ActionIcon, Loader } from '@mantine/core';
import { Video, X } from 'lucide-react';
import CameraGrid from '../raspberry/CameraGrid';

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
    <div className="m-0 w-full overflow-hidden rounded-[14px] border border-[var(--border-subtle,rgba(255,255,255,0.12))] bg-[var(--background-secondary,#1a1d28)]" role="region" aria-label="Cámaras Raspberry Pi en el chat">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] px-3 py-2 text-[11px] text-[var(--text-muted,rgba(255,255,255,0.45))]">
        <Video size={14} className="shrink-0 text-[var(--accent-primary,#5b8def)]" strokeWidth={2.5} />
        <span className="font-semibold text-[var(--text-primary,rgba(255,255,255,0.9))]">{label}</span>
        <span className="min-w-0 flex-1 truncate">
          {sessionConnecting ? 'Conectando SSH…' : 'Streams activos de la Pi4'}
        </span>
        {onClose && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar cámaras"
            className="ml-auto shrink-0"
          >
            <X size={14} />
          </ActionIcon>
        )}
      </div>
      {sessionError && !sessionId && (
        <p className="m-0 px-3 py-2.5 text-[12px] text-[#f87171]">{sessionError}</p>
      )}
      <div className="relative h-[280px] max-h-[45vh] min-h-[200px]">
        {sessionConnecting && !sessionId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#0a0a0c] text-[12px] text-[var(--text-muted,#888)]">
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
