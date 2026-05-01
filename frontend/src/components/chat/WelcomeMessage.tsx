import React from 'react';
import { MODE_SUGGESTIONS } from '../chatPane/chatPane.constants';
import { ChatMode } from '../chatModes/types';

interface WelcomeMessageProps {
  mode: ChatMode;
  handleSuggestionClick: (text: string) => void;
}

export default function WelcomeMessage({ mode, handleSuggestionClick }: WelcomeMessageProps) {
  return (
    <div className="chat-welcome">
      <div className="chat-welcome__icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
      </div>
      <h3 className="chat-welcome__title">Asistente SSH</h3>
      <p className="chat-welcome__subtitle">
        {mode === 'ask' && 'Pregunta, explica o genera código'}
        {mode === 'agente' && 'Ejecuta comandos y diagnostica tu servidor'}
        {mode === 'plan' && 'Genera planes estructurados por fases'}
      </p>
      <div className="chat-welcome__suggestions">
        {MODE_SUGGESTIONS[mode]?.map((s, i) => (
          <button key={i} className="chat-suggestion-chip" onClick={() => handleSuggestionClick(s.text)}>
            <span className="chip-icon">{s.icon}</span>
            <span className="chip-text">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
