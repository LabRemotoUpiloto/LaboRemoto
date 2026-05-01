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
import { Card, Text, Group, Badge, ActionIcon, Tooltip, Box } from '@mantine/core';

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
    <Card withBorder padding="md" radius="md" className="flex flex-col h-full bg-[#1e1e1e] border-white/5 hover:border-teal-500/30 transition-colors">
      <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
        <div className="flex-1 min-w-0">
          <Text size="sm" fw={600} truncate>{title}</Text>
          <Group gap="xs" mt={4}>
            {category && (
              <Badge size="xs" variant="light" color="teal">{category}</Badge>
            )}
            <Text size="xs" c="dimmed" title={new Date(createdAt).toLocaleString()}>
              {formatRelativeTime(createdAt)}
            </Text>
          </Group>
        </div>
        
        <Group gap="xs" wrap="nowrap" className="opacity-60 hover:opacity-100 transition-opacity">
          <Tooltip label="Copiar" withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onCopy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Editar" withArrow>
            <ActionIcon variant="subtle" color="blue" size="sm" onClick={onEdit}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Eliminar" withArrow>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Box
        className="flex-1 bg-[#121212] rounded overflow-hidden"
        style={{ margin: '-4px -8px' }}
      >
        <pre className="m-0 p-3 overflow-x-auto text-xs font-mono h-full max-h-[250px] custom-scrollbar">
          <code ref={codeRef} className="block">{content}</code>
        </pre>
      </Box>
    </Card>
  );
};

export default SnippetCard;
