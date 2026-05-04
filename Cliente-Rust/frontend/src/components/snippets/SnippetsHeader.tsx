import React from 'react';
import { TextInput, Select, Group, Text } from '@mantine/core';

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
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  categories,
  categoryFilter,
  onCategoryFilterChange,
}) => {
  return (
    <header className="page-header-integrated border-b border-white/5 pb-4">
      <h2 className="page-header-title">Snippets</h2>
      
      <div className="page-header-content">
        <p className="page-header-description mb-4">
          Guarda y organiza fragmentos de código reutilizables.
        </p>

        <Group gap="sm">
          <TextInput
            placeholder="Buscar..."
            value={filter}
            onChange={(e) => onFilterChange(e.currentTarget.value)}
            leftSection={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            }
            w={200}
            size="sm"
          />

          <Select
            placeholder="Categorías"
            value={categoryFilter || null}
            onChange={(v) => onCategoryFilterChange(v || '')}
            data={categories.map(c => ({ value: c, label: c }))}
            clearable
            size="sm"
            w={150}
          />

          <Select
            value={sortBy}
            onChange={(v) => onSortChange((v as 'date' | 'title' | 'updated') || 'date')}
            data={[
              { value: 'date', label: 'Recientes' },
              { value: 'updated', label: 'Modificado' },
              { value: 'title', label: 'Título' },
            ]}
            size="sm"
            w={140}
            allowDeselect={false}
          />
        </Group>
      </div>
    </header>
  );
};

export default SnippetsHeader;
