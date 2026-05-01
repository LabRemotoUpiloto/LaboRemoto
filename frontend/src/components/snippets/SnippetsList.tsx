import React from 'react';
import SnippetCard from './SnippetCard';
import './SnippetsList.css';

export interface Snippet {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  category?: string;
}

export interface SnippetsListProps {
  snippets: Snippet[];
  onCopy: (content: string) => void;
  onEdit: (snippet: Snippet) => void;
  onDelete: (id: string) => void;
  emptyMessage?: string;
}

const SnippetsList: React.FC<SnippetsListProps> = ({
  snippets,
  onCopy,
  onEdit,
  onDelete,
  emptyMessage = 'Aún no tienes snippets guardados.',
}) => {
  if (snippets.length === 0) {
    return (
      <div className="snippets-list">
        <div className="snippets-list__empty" role="status">
          <span className="snippets-list__empty-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          </span>
          <p className="snippets-list__empty-text">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="snippets-list">
      {snippets.map((snippet) => (
        <SnippetCard
          key={snippet.id}
          id={snippet.id}
          title={snippet.title}
          content={snippet.content}
          createdAt={snippet.createdAt}
          category={snippet.category}
          onCopy={() => onCopy(snippet.content)}
          onEdit={() => onEdit(snippet)}
          onDelete={() => onDelete(snippet.id)}
        />
      ))}
    </div>
  );
};

export default SnippetsList;
