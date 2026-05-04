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
    <div className="flex flex-col items-center justify-center flex-1 h-full opacity-60 pointer-events-none p-8 pb-[10vh] max-w-[500px] mx-auto text-center">
      <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-5 text-accent shadow-sm animate-in zoom-in duration-500">
        <Terminal size={28} strokeWidth={1.5} />
      </div>
      <h3 className="text-[17px] font-semibold text-white/90 m-0 mb-1 tracking-tight">Asistente SSH</h3>
      <p className="text-[13px] text-white/60 m-0 mb-8 max-w-[80%] leading-relaxed">
        {mode === 'ask' && 'Pregunta, explica o genera código'}
        {mode === 'agente' && 'Ejecuta comandos y diagnostica tu servidor'}
        {mode === 'plan' && 'Genera planes estructurados por fases'}
      </p>
      <div className="flex flex-wrap gap-2.5 justify-center max-w-[90%] pointer-events-auto">
        {MODE_SUGGESTIONS[mode]?.map((s, i) => (
          <button 
            key={i} 
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-white/10 bg-white/5 text-white/70 text-[12.5px] transition-all hover:bg-accent/10 hover:border-accent/30 hover:text-white hover:-translate-y-0.5" 
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
