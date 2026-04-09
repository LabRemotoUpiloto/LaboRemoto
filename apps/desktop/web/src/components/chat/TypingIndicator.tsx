import React from 'react';

interface TypingIndicatorProps {
  streamingMsgId: string | null;
  onCancel: () => void;
}

export default function TypingIndicator({ streamingMsgId, onCancel }: TypingIndicatorProps) {
  return (
    <div className="typing-indicator message-animate">
      <div className="typing-indicator__left">
        {!streamingMsgId ? (
          <><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></>
        ) : (
          <span className="typing-streaming-dot"/>
        )}
        <span className="typing-label">{streamingMsgId ? 'Generando…' : 'Pensando…'}</span>
      </div>
      <button className="typing-cancel-btn" onClick={onCancel} title="Cancelar (Esc)">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
        Detener
      </button>
    </div>
  );
}
