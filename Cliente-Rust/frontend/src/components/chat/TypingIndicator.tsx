import React from 'react';
import { Button } from '@mantine/core';
import { Square } from 'lucide-react';

interface TypingIndicatorProps {
  streamingMsgId: string | null;
  onCancel: () => void;
}

export default function TypingIndicator({ streamingMsgId, onCancel }: TypingIndicatorProps) {
  return (
    <div className="flex items-center justify-between text-xs text-white/50 bg-[#1e2130]/80 rounded-lg py-2 px-3 ml-[34px] border border-white/5 shadow-sm max-w-[400px] mt-1 mb-2 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2">
        {!streamingMsgId ? (
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-accent/80 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-1.5 h-1.5 bg-accent/80 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-1.5 h-1.5 bg-accent/80 rounded-full animate-bounce"></div>
          </div>
        ) : (
          <span className="w-2 h-2 bg-accent/80 rounded-full animate-pulse"/>
        )}
        <span className="font-medium tracking-wide">{streamingMsgId ? 'Generando…' : 'Pensando…'}</span>
      </div>
      <Button 
        variant="subtle" 
        color="gray" 
        size="compact-xs" 
        leftSection={<Square size={10} fill="currentColor" />}
        onClick={onCancel} 
        title="Cancelar (Esc)"
        className="text-white/40 hover:text-white/80 hover:bg-white/10"
      >
        Detener
      </Button>
    </div>
  );
}
