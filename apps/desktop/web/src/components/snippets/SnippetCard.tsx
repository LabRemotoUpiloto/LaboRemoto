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
              🏷️ {category}
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
          <span className="snippet-card__btn-icon">📋</span>
          Copiar
        </button>
        <button 
          className="snippet-card__btn snippet-card__btn--edit"
          onClick={onEdit}
          title="Editar snippet"
        >
          <span className="snippet-card__btn-icon">✏️</span>
          Editar
        </button>
        <button 
          className="snippet-card__btn snippet-card__btn--delete"
          onClick={onDelete}
          title="Eliminar snippet"
        >
          <span className="snippet-card__btn-icon">🗑️</span>
          Borrar
        </button>
      </div>
    </div>
  );
};

export default SnippetCard;
