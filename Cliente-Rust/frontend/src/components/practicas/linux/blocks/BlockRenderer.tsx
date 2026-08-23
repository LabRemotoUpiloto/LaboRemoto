// components/practicas/linux/blocks/BlockRenderer.tsx
//
// Despacha cada bloque del módulo (ver linuxPractice.service.ts) a su propio
// componente. `checkpoint` no renderiza nada acá — es leído por
// LinuxModulePage para saber cuándo mostrar la pantalla de cierre.

import React from 'react';
import { Paper, Text, Stack, Group, Badge, Checkbox } from '@mantine/core';
import type { LinuxBlock, LinuxValidationResult, LinuxValidationRule } from '../../../../services/linuxPractice.service';

const PALETTE = ['#4caf50', '#5b9bd5', '#e0a94a', '#e57373', '#a78bfa'];

/** Soporte mínimo de **negrita** — no se agrega una librería de markdown para esto. */
function renderInline(md: string): React.ReactNode {
  const parts = md.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function TextBlockView({ block }: { block: Extract<LinuxBlock, { type: 'text' }> }) {
  return (
    <Text fz="sm" style={{ lineHeight: 1.6 }}>
      {renderInline(block.body_md)}
    </Text>
  );
}

function TerminalAnnotationBlock({ block }: { block: Extract<LinuxBlock, { type: 'terminal_annotation' }> }) {
  const { prompt_example, labels } = block;
  const segments: { text: string; label?: string; color?: string }[] = [];
  let cursor = 0;

  labels.forEach((lbl, i) => {
    const idx = prompt_example.indexOf(lbl.span, cursor);
    if (idx === -1) return;
    if (idx > cursor) segments.push({ text: prompt_example.slice(cursor, idx) });
    segments.push({
      text: prompt_example.slice(idx, idx + lbl.span.length),
      label: lbl.label,
      color: PALETTE[i % PALETTE.length],
    });
    cursor = idx + lbl.span.length;
  });
  if (cursor < prompt_example.length) segments.push({ text: prompt_example.slice(cursor) });

  return (
    <Paper withBorder radius="md" p="md" style={{ background: '#14150F' }}>
      <Text ff="monospace" fz="sm" style={{ color: '#E5E9DE' }}>
        {segments.map((s, i) =>
          s.label ? (
            <span
              key={i}
              title={s.label}
              style={{ borderBottom: `2px solid ${s.color}`, paddingBottom: 1, color: s.color, cursor: 'help' }}
            >
              {s.text}
            </span>
          ) : (
            <React.Fragment key={i}>{s.text}</React.Fragment>
          ),
        )}
      </Text>
      <Group gap="md" mt="sm">
        {labels.map((lbl, i) => (
          <Group key={i} gap={6}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: PALETTE[i % PALETTE.length],
                display: 'inline-block',
              }}
            />
            <Text fz="xs" c="dimmed">{lbl.label}</Text>
          </Group>
        ))}
      </Group>
    </Paper>
  );
}

function AnalogyBlock({ block }: { block: Extract<LinuxBlock, { type: 'analogy' }> }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text fz="xs" tt="uppercase" fw={700} c="teal" mb={8} style={{ letterSpacing: '0.06em' }}>
        {block.term}
      </Text>
      <Group grow align="flex-start" gap="md">
        <Stack gap={4}>
          <Text fz="xs" c="dimmed" tt="uppercase">Objeto cotidiano</Text>
          <Text fz="sm">{block.everyday}</Text>
        </Stack>
        <Stack gap={4}>
          <Text fz="xs" c="dimmed" tt="uppercase">En Windows</Text>
          <Text fz="sm">{block.windows}</Text>
        </Stack>
        <Stack gap={4}>
          <Text fz="xs" c="dimmed" tt="uppercase">En Linux</Text>
          <Text fz="sm">{block.linux}</Text>
        </Stack>
      </Group>
    </Paper>
  );
}

function CommandStepBlock({
  block,
  passed,
  points,
}: {
  block: Extract<LinuxBlock, { type: 'command_step' }>;
  passed: boolean;
  points?: number;
}) {
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      style={passed ? { borderColor: 'var(--success, #10b981)' } : undefined}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group align="flex-start" gap="sm" wrap="nowrap">
          <Checkbox checked={passed} readOnly mt={2} />
          <Stack gap={4}>
            <Text ff="monospace" fz="sm" fw={600}>{block.command}</Text>
            <Text fz="xs" c="dimmed">{renderInline(block.explain_md)}</Text>
          </Stack>
        </Group>
        {typeof points === 'number' && (
          <Badge variant="light" color={passed ? 'green' : 'gray'}>{points} pts</Badge>
        )}
      </Group>
    </Paper>
  );
}

interface BlockViewProps {
  block: LinuxBlock;
  rules: LinuxValidationRule[];
  result: LinuxValidationResult | null;
}

export const BlockView: React.FC<BlockViewProps> = ({ block, rules, result }) => {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} />;
    case 'terminal_annotation':
      return <TerminalAnnotationBlock block={block} />;
    case 'analogy':
      return <AnalogyBlock block={block} />;
    case 'command_step': {
      const rule = rules.find((r) => r.target === block.command);
      const ruleResult = rule ? result?.results.find((r) => r.rule_id === rule.id) : undefined;
      return <CommandStepBlock block={block} passed={!!ruleResult?.passed} points={rule?.points} />;
    }
    case 'checkpoint':
      return null;
    default:
      return null;
  }
};
