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
    <header className="snippets-header">
      <div className="snippets-header__title-section">
        <h1 className="snippets-header__title">Snippets</h1>
        <span className="snippets-header__count">
          {isFiltering ? (
            <>
              {filteredCount} de {totalCount}
            </>
          ) : (
            totalCount
          )}
        </span>
      </div>

      <div className="snippets-header__actions">
        <div className="snippets-header__search-wrapper">
          <span className="snippets-header__search-icon">🔍</span>
          <input
            type="text"
            className="snippets-header__search-input"
            placeholder="Buscar snippets..."
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
          {filter && (
            <button
              className="snippets-header__clear-btn"
              onClick={() => onFilterChange('')}
              title="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>

        <select
          className="snippets-header__category-select"
          value={categoryFilter}
          onChange={(e) => onCategoryFilterChange(e.target.value)}
          title="Filtrar por categoría"
        >
          <option value="">🏷️ Todas las categorías</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          className="snippets-header__sort-select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as 'date' | 'title' | 'updated')}
          title="Ordenar por"
        >
          <option value="date">📅 Más recientes</option>
          <option value="updated">🕒 Última modificación</option>
          <option value="title">🔤 Por título</option>
        </select>
      </div>
    </header>
  );
};

export default SnippetsHeader;
