import React, { useEffect, useRef } from 'react';
import { TextInput, Textarea, Button, Group, Badge, Paper, Text } from '@mantine/core';

export interface SnippetFormProps {
  title: string;
  content: string;
  category?: string;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onCategoryChange?: (category: string) => void;
  onSave: () => void;
  onClear: () => void;
  isEditing?: boolean;
  editingTitle?: string;
}

const SnippetForm: React.FC<SnippetFormProps> = ({
  title,
  content,
  category = '',
  onTitleChange,
  onContentChange,
  onCategoryChange,
  onSave,
  onClear,
  isEditing = false,
  editingTitle = '',
}) => {
  const isSaveDisabled = !content.trim();

  return (
    <Paper withBorder radius="md" p="md" className={`transition-all duration-300 ${isEditing ? 'border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.1)]' : 'border-white/10'}`}>
      {isEditing && (
        <Group gap="xs" mb="md">
          <Badge color="teal" variant="light" size="sm" leftSection={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          }>
            Editando
          </Badge>
          <Text size="sm" fw={600}>{editingTitle}</Text>
        </Group>
      )}

      <div className="flex gap-4 mb-4">
        <TextInput
          flex={1}
          placeholder="Título (opcional)"
          value={title}
          onChange={(e) => onTitleChange(e.currentTarget.value)}
          maxLength={100}
        />
        <TextInput
          flex={1}
          placeholder="Categoría (ej: Python, Linux...)"
          value={category}
          onChange={(e) => onCategoryChange?.(e.currentTarget.value)}
          maxLength={30}
        />
      </div>

      <Textarea
        placeholder="Contenido del snippet..."
        value={content}
        onChange={(e) => onContentChange(e.currentTarget.value)}
        autosize
        minRows={4}
        maxRows={15}
        styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
      />
      
      <Group justify="space-between" mt="md" align="center">
        <Text size="xs" c="dimmed">{content.length} caracteres</Text>
        <Group gap="sm">
          <Button
            variant="subtle"
            color="gray"
            onClick={onClear}
            size="sm"
          >
            {isEditing ? 'Cancelar' : 'Limpiar'}
          </Button>
          <Button
            color="teal"
            onClick={onSave}
            disabled={isSaveDisabled}
            size="sm"
            leftSection={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            }
          >
            {isEditing ? 'Actualizar' : 'Guardar'}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
};

export default SnippetForm;
