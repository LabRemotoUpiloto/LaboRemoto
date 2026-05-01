import React, { useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
// Import common languages
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import 'highlight.js/styles/atom-one-dark.css';
import './SnippetCard.css';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('sql', sql);

export interface SnippetCardProps {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  category?: string;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const SnippetCard: React.FC<SnippetCardProps> = ({
  title,
  content,
  createdAt,
  category,
  onCopy,
  onEdit,
  onDelete,
}) => {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      // Auto-detect language and highlight
      hljs.highlightElement(codeRef.current);
    }
  }, [content]);

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return new Date(timestamp).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    if (days > 0) return `Hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'Hace un momento';
  };

  return (
    <div className="snippet-card">
      <div className="snippet-card__header">
        <div className="snippet-card__header-main">
          <h3 className="snippet-card__title">{title}</h3>
          {category && (
            <span className="snippet-card__category" title={`Categoría: ${category}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              {category}
            </span>
          )}
        </div>
        <span className="snippet-card__date" title={new Date(createdAt).toLocaleString()}>
          {formatRelativeTime(createdAt)}
        </span>
      </div>
      
      <pre className="snippet-card__body">
        <code ref={codeRef}>{content}</code>
      </pre>
      
      <div className="snippet-card__actions">
        <button 
          className="snippet-card__btn snippet-card__btn--copy"
          onClick={onCopy}
          title="Copiar contenido"
        >
          <span className="snippet-card__btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </span>
          Copiar
        </button>
        <button 
          className="snippet-card__btn snippet-card__btn--edit"
          onClick={onEdit}
          title="Editar snippet"
        >
          <span className="snippet-card__btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </span>
          Editar
        </button>
        <button 
          className="snippet-card__btn snippet-card__btn--delete"
          onClick={onDelete}
          title="Eliminar snippet"
        >
          <span className="snippet-card__btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </span>
          Borrar
        </button>
      </div>
    </div>
  );
};

export default SnippetCard;
