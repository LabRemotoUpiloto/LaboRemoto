import React from 'react';
import { MODE_SUGGESTIONS } from '../chatPane/chatPane.constants';
import { ChatMode } from '../chatModes/types';
import { Terminal } from 'lucide-react';

interface WelcomeMessageProps {
  mode: ChatMode;
  handleSuggestionClick: (text: string) => void;
}

export default function WelcomeMessage({ mode, handleSuggestionClick }: WelcomeMessageProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 h-full opacity-70 pointer-events-none p-8 pb-[10vh] max-w-[500px] mx-auto text-center">
      <div className="w-14 h-14 rounded-full bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary)]/20 flex items-center justify-center mb-5 text-accent shadow-sm animate-in zoom-in duration-500">
        <Terminal size={28} strokeWidth={1.5} />
      </div>
      <h3 className="text-[17px] font-semibold text-[var(--text-primary)] m-0 mb-1 tracking-tight">Asistente SSH</h3>
      <p className="text-[13px] text-[var(--text-secondary)] m-0 mb-8 max-w-[80%] leading-relaxed">
        {mode === 'ask' && 'Pregunta, explica o genera código'}
        {mode === 'agente' && 'Ejecuta comandos y diagnostica tu servidor'}
        {mode === 'plan' && 'Genera planes estructurados por fases'}
      </p>
      <div className="flex flex-wrap gap-2.5 justify-center max-w-[90%] pointer-events-auto">
        {MODE_SUGGESTIONS[mode]?.map((s, i) => (
          <button 
            key={i} 
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--background-tertiary)] text-[var(--text-secondary)] text-[12.5px] transition-all hover:bg-[var(--interactive-hover)] hover:border-[var(--accent-primary)]/30 hover:text-[var(--text-primary)] hover:-translate-y-0.5" 
            onClick={() => handleSuggestionClick(s.text)}
          >
            <span className="opacity-80">{s.icon}</span>
            <span className="font-medium">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
