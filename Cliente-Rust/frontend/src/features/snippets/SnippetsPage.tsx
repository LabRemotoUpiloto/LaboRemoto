import React, { useCallback, useMemo, useState } from 'react';
import SnippetForm from './SnippetForm';
import SnippetsList from './SnippetsList';
import { useToasts } from '@/app/providers/ToastContext';
import { modals } from '@mantine/modals';
import { Box, Container, Stack, Title, Text, Group, TextInput, Select } from '@mantine/core';
import { Search } from 'lucide-react';

export interface UserSnippet {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
  category?: string;
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

  // Única fuente de verdad para persistir -- antes `addSnippet`/`deleteSnippet`
  // también llamaban a `saveStored` a mano dentro del setter, duplicando la
  // escritura a localStorage en cada acción. `setSnippets` siempre dispara
  // este efecto, así que alcanza con guardar acá.
  const updateSnippets = useCallback((updater: (prev: UserSnippet[]) => UserSnippet[]) => {
    setSnippets(prev => {
      const next = updater(prev);
      saveStored(next);
      return next;
    });
  }, []);

  const addSnippet = useCallback(() => {
    const t = title.trim();
    const c = text.trim();
    const cat = category.trim();
    if (!c) return;

    if (editingId) {
      updateSnippets(prev => prev.map(s =>
        s.id === editingId
          ? { ...s, title: t || 'Sin título', content: c, category: cat || undefined, updatedAt: Date.now() }
          : s
      ));
      push({ type: 'success', message: 'Snippet actualizado' });
      setEditingId(null);
    } else {
      const sn: UserSnippet = {
        id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
        title: t || 'Sin título',
        content: c,
        category: cat || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      updateSnippets(prev => [sn, ...prev].slice(0, 500));
      push({ type: 'success', message: 'Snippet guardado' });
    }
    setTitle('');
    setText('');
    setCategory('');
  }, [title, text, category, editingId, push, updateSnippets]);

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
        updateSnippets(prev => prev.filter(s => s.id !== id));
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

  const editingSnippet = editingId ? snippets.find(s => s.id === editingId) : null;

  return (
    <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
      <Container size="lg" py="xl" px="xl">
        <Stack gap="xl">
          {/* Mismo patrón de encabezado que Logs/Prácticas (Title + descripción
              apiladas) -- antes esta página usaba la barra compacta de 36px
              que comparten Ajustes/Perfil/Temas, pensada para páginas de
              configuración, no para una página de contenido como esta. */}
          <Stack gap={4}>
            <Title order={1}>Snippets</Title>
            <Text size="md" c="dimmed" maw={580}>
              Guardá los comandos y scripts que repetís seguido en tus sesiones SSH,
              para no tener que escribirlos de nuevo cada vez.
            </Text>
          </Stack>

          <Group gap="sm">
            <TextInput
              placeholder="Buscar..."
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value)}
              leftSection={<Search size={14} style={{ color: 'var(--text-secondary)' }} />}
              size="sm"
              w={200}
              className="dribbble-toolbar-input"
            />
            <Select
              placeholder="Categorías"
              value={categoryFilter || null}
              onChange={(v) => setCategoryFilter(v || '')}
              data={allCategories.map(c => ({ value: c, label: c }))}
              clearable
              size="sm"
              w={160}
              className="dribbble-toolbar-input"
            />
            <Select
              value={sortBy}
              onChange={(v) => setSortBy((v as 'date' | 'title' | 'updated') || 'date')}
              data={[
                { value: 'date', label: 'Recientes' },
                { value: 'updated', label: 'Modificado' },
                { value: 'title', label: 'Título' },
              ]}
              size="sm"
              w={140}
              allowDeselect={false}
              className="dribbble-toolbar-input"
            />
          </Group>

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
                  : 'Todavía no guardaste ningún comando. Guardá el primero que uses seguido, arriba.'
              }
            />
          </section>
        </Stack>
      </Container>
    </Box>
  );
};

export default SnippetsPage;
