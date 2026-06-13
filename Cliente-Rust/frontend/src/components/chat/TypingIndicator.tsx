import React from 'react';
import type { ChatAppearance } from './ChatMessageList';

interface TypingIndicatorProps {
  appearance?: ChatAppearance;
  streamingMsgId: string | null;
}

export default function TypingIndicator({ appearance = 'session', streamingMsgId }: TypingIndicatorProps) {
  const isLanding = appearance === 'landing';
  const label = streamingMsgId ? 'Generando…' : 'Pensando…';

  const dot = isLanding ? 'bg-[var(--accent-primary)]' : 'bg-accent/80';

  return (
    <div
      className={[
        'typing-indicator flex items-center gap-2.5 text-xs rounded-2xl py-2.5 px-3.5 mt-1 mb-2',
        'animate-in fade-in slide-in-from-bottom-2',
        isLanding
          ? 'typing-indicator--landing w-full max-w-[min(720px,100%)] mx-auto border shadow-sm'
          : 'text-white/50 bg-[#1e2130]/80 ml-[34px] border-white/5 shadow-sm max-w-[400px]',
      ].join(' ')}
      style={
        isLanding
          ? {
              backgroundColor: 'var(--background-secondary)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }
          : undefined
      }
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {!streamingMsgId ? (
        <div className="flex gap-1 shrink-0" aria-hidden>
          <div className={`w-1.5 h-1.5 ${dot} rounded-full animate-bounce [animation-delay:-0.3s]`} />
          <div className={`w-1.5 h-1.5 ${dot} rounded-full animate-bounce [animation-delay:-0.15s]`} />
          <div className={`w-1.5 h-1.5 ${dot} rounded-full animate-bounce`} />
        </div>
      ) : (
        <span className={`w-2 h-2 ${dot} rounded-full animate-pulse shrink-0`} aria-hidden />
      )}
      <span className="font-medium tracking-wide truncate" style={isLanding ? { color: 'var(--text-primary)' } : undefined}>
        {label}
      </span>
    </div>
  );
}
