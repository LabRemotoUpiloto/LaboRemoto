import React from 'react';
import type { ChatAppearance } from './ChatMessageList';

type Props = {
  text: string;
  appearance?: ChatAppearance;
};

/** Aviso compacto del sistema (no usa timeline ni bloque RESPUESTA). */
export default function SystemMessageBanner({ text, appearance = 'session' }: Props) {
  return (
    <div
      className="w-full max-w-[720px] mx-auto px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--background-tertiary)] text-[12px] text-[var(--text-secondary)]"
      role="status"
    >
      {text}
    </div>
  );
}
