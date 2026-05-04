import React from 'react';
import { ActionIcon, TextInput } from '@mantine/core';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

interface Props {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  setSearchOpen: (v: boolean) => void;
  searchMatchIds: string[];
  searchMatchIndex: number;
  setSearchMatchIndex: React.Dispatch<React.SetStateAction<number>>;
}

const ChatSearchBar: React.FC<Props> = ({
  searchQuery, setSearchQuery, setSearchOpen,
  searchMatchIds, searchMatchIndex, setSearchMatchIndex,
}) => (
  <div className="flex items-center gap-2 h-9 px-3 bg-secondary/95 backdrop-blur-sm border-b border-white/5 shadow-[0_2px_8px_rgba(0,0,0,0.2)] animate-in slide-in-from-top-2 fade-in duration-200 sticky top-[48px] z-[99]">
    <Search size={13} className="text-white/40 shrink-0" />
    <TextInput
      className="flex-1"
      classNames={{
        input: "bg-transparent border-none text-white text-[12.5px] outline-none placeholder-white/30 px-1 h-auto min-h-0 py-0 focus:ring-0"
      }}
      placeholder="Buscar en mensajes…"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
      autoFocus
      onKeyDown={e => {
        if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
        if (e.key === 'Enter') {
          if (searchMatchIds.length === 0) return;
          if (e.shiftKey) {
            setSearchMatchIndex(i => (i - 1 + searchMatchIds.length) % searchMatchIds.length);
          } else {
            setSearchMatchIndex(i => (i + 1) % searchMatchIds.length);
          }
        }
      }}
    />
    
    {searchQuery && (
      <span className="text-[11px] text-white/40 tabular-nums shrink-0 px-1">
        {searchMatchIds.length === 0
          ? 'Sin resultados'
          : `${searchMatchIndex + 1} / ${searchMatchIds.length}`}
      </span>
    )}
    
    {searchMatchIds.length > 1 && (
      <div className="flex items-center">
        <ActionIcon 
          variant="subtle" 
          color="gray" 
          size="sm" 
          title="Anterior (Shift+Enter)"
          onClick={() => setSearchMatchIndex(i => (i - 1 + searchMatchIds.length) % searchMatchIds.length)}
          className="text-white/50 hover:bg-white/10 hover:text-white rounded"
        >
          <ChevronUp size={14} />
        </ActionIcon>
        <ActionIcon 
          variant="subtle" 
          color="gray" 
          size="sm" 
          title="Siguiente (Enter)"
          onClick={() => setSearchMatchIndex(i => (i + 1) % searchMatchIds.length)}
          className="text-white/50 hover:bg-white/10 hover:text-white rounded"
        >
          <ChevronDown size={14} />
        </ActionIcon>
      </div>
    )}
    
    <div className="w-[1px] h-3.5 bg-white/15 mx-0.5 shrink-0" />
    
    <ActionIcon 
      variant="subtle" 
      color="red" 
      size="sm" 
      title="Cerrar (Esc)"
      onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
      className="text-white/50 hover:bg-red-500/20 hover:text-red-400 rounded shrink-0"
    >
      <X size={14} />
    </ActionIcon>
  </div>
);

export default ChatSearchBar;
