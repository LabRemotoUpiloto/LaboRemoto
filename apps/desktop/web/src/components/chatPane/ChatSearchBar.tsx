import React from 'react';

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
  <div className="chat-search-bar">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input
      type="text"
      className="chat-search-input"
      placeholder="Buscar en mensajes…"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
      autoFocus
      onKeyDown={e => {
        if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
        if (e.key === 'Enter') {
          if (searchMatchIds.length === 0) return;
          setSearchMatchIndex(i => (i + 1) % searchMatchIds.length);
        }
      }}
    />
    {searchQuery && (
      <span className="chat-search-count">
        {searchMatchIds.length === 0
          ? 'Sin resultados'
          : `${searchMatchIndex + 1} / ${searchMatchIds.length}`}
      </span>
    )}
    {searchMatchIds.length > 1 && (
      <>
        <button className="search-nav-btn" title="Anterior (Shift+Enter)"
          onClick={() => setSearchMatchIndex(i => (i - 1 + searchMatchIds.length) % searchMatchIds.length)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button className="search-nav-btn" title="Siguiente (Enter)"
          onClick={() => setSearchMatchIndex(i => (i + 1) % searchMatchIds.length)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </>
    )}
    <button className="search-nav-btn search-close-btn" title="Cerrar (Esc)"
      onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>
);

export default ChatSearchBar;
