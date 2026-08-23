import React from 'react';
import type { ChatAppearance } from './ChatMessageList';

interface TypingIndicatorProps {
  appearance?: ChatAppearance;
  streamingMsgId: string | null;
}

export default function TypingIndicator({ appearance = 'session', streamingMsgId }: TypingIndicatorProps) {
  const isLanding = appearance === 'landing';
  const label = streamingMsgId ? 'Generando…' : 'Pensando…';

  return (
    <div
      className={[
        'typing-indicator flex items-center gap-2.5 text-xs rounded-2xl py-2 px-3 mt-1 mb-2',
        'animate-in fade-in slide-in-from-bottom-2 border',
        isLanding
          ? 'typing-indicator--landing w-full max-w-[min(720px,100%)] mx-auto shadow-sm'
          : 'ml-[34px] shadow-sm max-w-[400px]',
      ].join(' ')}
      style={{
        backgroundColor: 'var(--background-secondary)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-secondary)',
      }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <img
        src="/abeja-Profesor.jpeg"
        alt=""
        aria-hidden
        className="w-6 h-6 rounded-full object-contain bg-white shrink-0"
        style={{ border: '1.5px solid var(--border-subtle)', boxShadow: '0 0 0 2px var(--background-secondary)' }}
      />
      <span className="font-medium tracking-wide truncate" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
    </div>
  );
}
