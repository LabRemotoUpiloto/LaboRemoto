import React from 'react';
import './SnippetsHeader.css';

export interface SnippetsHeaderProps {
  totalCount: number;
  filteredCount: number;
  filter: string;
  onFilterChange: (filter: string) => void;
  sortBy: 'date' | 'title' | 'updated';
  onSortChange: (sortBy: 'date' | 'title' | 'updated') => void;
  categories: string[];
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
}

const SnippetsHeader: React.FC<SnippetsHeaderProps> = ({
  totalCount,
  filteredCount,
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  categories,
  categoryFilter,
  onCategoryFilterChange,
}) => {
  const isFiltering = filter.trim().length > 0 || categoryFilter.length > 0;

  return (
    <header className="page-header-integrated snippets-header-integrated">
      <h2 className="page-header-title">Snippets</h2>
      
      <div className="page-header-content">
        <p className="page-header-description">
          Guarda y organiza fragmentos de código reutilizables.
        </p>

        <div className="page-header-actions">
          <div className="snippets-search-wrapper">
            <span className="snippets-search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              type="text"
              className="snippets-search-input"
              placeholder="Buscar..."
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
            />
          </div>

          <select
            className="snippets-select"
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
          >
            <option value="">Categorías</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            className="snippets-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as 'date' | 'title' | 'updated')}
          >
            <option value="date">Recientes</option>
            <option value="updated">Modificado</option>
            <option value="title">Título</option>
          </select>
        </div>
      </div>
    </header>
  );
};

export default SnippetsHeader;
