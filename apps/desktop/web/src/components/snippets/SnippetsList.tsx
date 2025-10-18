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
        <div className="snippets-list__empty">
          <span className="snippets-list__empty-icon">📝</span>
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
