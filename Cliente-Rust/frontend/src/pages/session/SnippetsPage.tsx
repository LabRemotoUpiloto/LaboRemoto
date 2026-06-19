import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SnippetsHeader from '../../components/snippets/SnippetsHeader';
import SnippetForm from '../../components/snippets/SnippetForm';
import SnippetsList from '../../components/snippets/SnippetsList';
import { useToasts } from '../../contexts/ToastContext';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';

export interface UserSnippet {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
  category?: string;
  sessionId?: string;
  lastFileRef?: string;
}

const STORAGE_KEY = 'user-snippets-v1';

function loadStored(): UserSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(s => s && typeof s.id === 'string' && typeof s.content === 'string');
  } catch { return []; }
}

function saveStored(list: UserSnippet[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

const SnippetsPage: React.FC = () => {
  const { push } = useToasts();
  const [snippets, setSnippets] = useState<UserSnippet[]>(() => loadStored());
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'updated'>('date');
  const [editingId, setEditingId] = useState<string | null>(null);

  const addSnippet = useCallback(() => {
    const t = title.trim();
    const c = text.trim();
    const cat = category.trim();
    if (!c) return;

    if (editingId) {
      setSnippets(prev => {
        const next = prev.map(s => 
          s.id === editingId 
            ? { ...s, title: t || 'Sin título', content: c, category: cat || undefined, updatedAt: Date.now() }
            : s
        );
        saveStored(next);
        return next;
      });
      push({ type: 'success', message: 'Snippet actualizado' });
      setEditingId(null);
    } else {
      const sn: UserSnippet = {
        id: String(Date.now()) + Math.random().toString(36).slice(2,8),
        title: t || 'Sin título',
        content: c,
        category: cat || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSnippets(prev => {
        const next = [sn, ...prev].slice(0, 500);
        saveStored(next);
        return next;
      });
      push({ type: 'success', message: 'Snippet guardado' });
    }
    setTitle('');
    setText('');
    setCategory('');
  }, [title, text, category, editingId, push]);

  const deleteSnippet = (id: string) => {
    const snippet = snippets.find(s => s.id === id);
    if (!snippet) return;
    
    modals.openConfirmModal({
      title: 'Eliminar snippet',
      centered: true,
      children: (
        <Text size="sm">¿Eliminar el snippet <strong>"{snippet.title}"</strong>? Esta acción no se puede deshacer.</Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        setSnippets(prev => {
          const next = prev.filter(s => s.id !== id);
          saveStored(next);
          return next;
        });
        push({ type: 'success', message: 'Snippet eliminado' });
      }
    });
  };

  const editSnippet = (snippet: UserSnippet) => {
    setTitle(snippet.title);
    setText(snippet.content);
    setCategory(snippet.category || '');
    setEditingId(snippet.id);
  };

  const clearForm = () => {
    setTitle('');
    setText('');
    setCategory('');
    setEditingId(null);
  };

  const copySnippet = (content: string) => {
    try { 
      navigator.clipboard.writeText(content);
      push({ type: 'success', message: 'Copiado al portapapeles' });
    } catch {
      push({ type: 'error', message: 'Error al copiar' });
    }
  };

  const filteredAndSortedSnippets = useMemo(() => {
    const f = filter.trim().toLowerCase();
    
    let filtered = f 
      ? snippets.filter(s => (s.title.toLowerCase().includes(f) || s.content.toLowerCase().includes(f)))
      : snippets;
    
    if (categoryFilter) {
      filtered = filtered.filter(s => s.category === categoryFilter);
    }
    
    if (sortBy === 'date') {
      filtered = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortBy === 'updated') {
      filtered = [...filtered].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    } else {
      filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    
    return filtered;
  }, [snippets, filter, categoryFilter, sortBy]);
  
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    snippets.forEach(s => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  }, [snippets]);

  useEffect(() => { saveStored(snippets); }, [snippets]);

  const editingSnippet = editingId ? snippets.find(s => s.id === editingId) : null;

  return (
    <div className="flex flex-col h-full">
      <SnippetsHeader
        totalCount={snippets.length}
        filteredCount={filteredAndSortedSnippets.length}
        filter={filter}
        onFilterChange={setFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        categories={allCategories}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
      />

      <div className="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-8">
          <SnippetForm
            title={title}
            content={text}
            category={category}
            onTitleChange={setTitle}
            onContentChange={setText}
            onCategoryChange={setCategory}
            onSave={addSnippet}
            onClear={clearForm}
            isEditing={!!editingId}
            editingTitle={editingSnippet?.title || ''}
          />

          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              {(filter || categoryFilter) ? `Resultados (${filteredAndSortedSnippets.length})` : `Guardados (${snippets.length})`}
            </h2>
            
            <SnippetsList
              snippets={filteredAndSortedSnippets}
              onCopy={copySnippet}
              onEdit={editSnippet}
              onDelete={deleteSnippet}
              emptyMessage={
                (filter || categoryFilter)
                  ? 'No se encontraron snippets con ese filtro.' 
                  : 'Aún no tienes snippets guardados. ¡Crea tu primer snippet arriba!'
              }
            />
          </section>
        </div>
      </div>
    </div>
  );
};

export default SnippetsPage;
