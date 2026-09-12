// components/practicas/linux/blocks/BlockRenderer.tsx
//
// Despacha cada bloque del módulo (ver linuxPractice.service.ts) a su propio
// componente. `checkpoint` no renderiza nada acá — es leído por
// LinuxModulePage para saber cuándo mostrar la pantalla de cierre.

import React, { useEffect, useState } from 'react';
import { Paper, Text, Stack, Group, Badge, Checkbox, Radio, Loader, Alert, ActionIcon } from '@mantine/core';
import { AlertTriangle, X } from 'lucide-react';
import type { LinuxBlock, LinuxValidationResult, LinuxValidationRule } from '../../../../services/linuxPractice.service';
import { linuxGetMedia } from '../../../../services/linuxPractice.service';

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

function MediaBlock({ block, practiceId }: { block: Extract<LinuxBlock, { type: 'media' }>; practiceId: string }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; url: string } | { status: 'error'; message: string }>({ status: 'loading' });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setExpanded(false);
    linuxGetMedia(practiceId, block.file)
      .then((media) => {
        if (cancelled) return;
        setState({ status: 'ok', url: `data:${media.mime};base64,${media.base64}` });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => { cancelled = true; };
  }, [practiceId, block.file]);

  return (
    <Paper withBorder radius="md" p="md">
      {state.status === 'loading' && (
        <Stack align="center" py="lg" gap="xs">
          <Loader size="sm" />
          <Text fz="xs" c="dimmed">Cargando media…</Text>
        </Stack>
      )}
      {state.status === 'error' && (
        <Alert color="red" variant="light" icon={<AlertTriangle size={14} />} title="No se pudo cargar este archivo">
          <Text fz="xs">{state.message}</Text>
        </Alert>
      )}
      {/*
        UN SOLO wrapper, montado siempre en la misma posición del árbol --
        solo cambia su `style` (chico e inline <-> fixed cubriendo la
        pantalla) según `expanded`. El <video>/<img> de adentro nunca se
        desmonta: si existieran dos elementos <video> distintos (uno para
        "chico" y otro para el modal), reproducir cortaría la reproducción
        y la arrancaría de cero en el segundo. Por eso tampoco se usa un
        portal acá: portear a otro nodo del DOM no ayuda a conservar el
        estado si de paso cambia la posición en el árbol de React.
      */}
      {state.status === 'ok' && (
        <div
          style={
            expanded
              ? {
                  position: 'fixed', inset: 0, zIndex: 3000,
                  background: 'rgba(10, 10, 8, 0.92)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: 24,
                }
              : { position: 'relative' }
          }
          onClick={(e) => { if (expanded && e.target === e.currentTarget) setExpanded(false); }}
        >
          {expanded && (
            <ActionIcon
              variant="light" color="gray" radius="xl" size="lg"
              style={{ position: 'absolute', top: 20, right: 20 }}
              onClick={() => setExpanded(false)}
              aria-label="Cerrar"
            >
              <X size={18} />
            </ActionIcon>
          )}
          {block.kind === 'image' ? (
            <img
              src={state.url}
              alt={block.caption ?? block.file}
              onClick={() => setExpanded(true)}
              style={{
                maxWidth: '100%',
                maxHeight: expanded ? '85vh' : undefined,
                borderRadius: expanded ? 8 : 6,
                display: 'block',
                cursor: 'zoom-in',
              }}
            />
          ) : (
            <video
              src={state.url}
              controls
              onPlay={() => setExpanded(true)}
              style={{
                width: expanded ? 'auto' : '100%',
                maxWidth: expanded ? '92vw' : undefined,
                maxHeight: expanded ? '80vh' : undefined,
                borderRadius: expanded ? 8 : 6,
                aspectRatio: expanded ? undefined : '16 / 9',
                background: '#000',
              }}
            />
          )}
          {block.caption && (
            <Text
              fz={expanded ? 'sm' : 'xs'}
              c={expanded ? 'gray.3' : 'dimmed'}
              mt={8}
              ta="center"
            >
              {block.caption}
            </Text>
          )}
        </div>
      )}
    </Paper>
  );
}

function QuizBlock({
  block,
  passed,
  answered,
  points,
  selected,
  onSelect,
  locked,
}: {
  block: Extract<LinuxBlock, { type: 'quiz' }>;
  passed: boolean;
  answered: boolean;
  points?: number;
  selected?: string;
  onSelect: (optionId: string) => void;
  /** Una vez que llegó un resultado validado (correcto o no), la pregunta deja de poder cambiarse. */
  locked: boolean;
}) {
  const showFeedback = locked && answered;
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      style={showFeedback ? { borderColor: passed ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)' } : undefined}
    >
      <Group justify="space-between" align="flex-start" mb={8}>
        <Text fz="sm" fw={600} style={{ lineHeight: 1.5 }}>{renderInline(block.question_md)}</Text>
        {typeof points === 'number' && (
          <Badge variant="light" color={showFeedback ? (passed ? 'green' : 'red') : 'gray'}>{points} pts</Badge>
        )}
      </Group>
      <Radio.Group value={selected ?? null} onChange={onSelect}>
        <Stack gap={6}>
          {block.options.map((opt) => (
            <Radio key={opt.id} value={opt.id} label={opt.label} disabled={locked} />
          ))}
        </Stack>
      </Radio.Group>
      {showFeedback && (
        <Text fz="xs" mt={8} c={passed ? 'green' : 'red'}>
          {passed ? 'Correcto.' : 'Incorrecto — revisá el bloque de arriba antes de la evaluación final.'}
        </Text>
      )}
    </Paper>
  );
}

interface BlockViewProps {
  block: LinuxBlock;
  rules: LinuxValidationRule[];
  result: LinuxValidationResult | null;
  /** Solo lo usa el bloque `media` -- para pedirla vía practicas_linux_get_media. */
  practiceId: string;
  /** Solo lo usan los bloques `quiz` -- selección en curso + callback + si ya se envió la evaluación. */
  quizAnswers?: Record<string, string>;
  onQuizAnswer?: (questionId: string, optionId: string) => void;
  quizLocked?: boolean;
}

export const BlockView: React.FC<BlockViewProps> = ({ block, rules, result, practiceId, quizAnswers, onQuizAnswer, quizLocked }) => {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} />;
    case 'terminal_annotation':
      return <TerminalAnnotationBlock block={block} />;
    case 'analogy':
      return <AnalogyBlock block={block} />;
    case 'media':
      return <MediaBlock block={block} practiceId={practiceId} />;
    case 'command_step': {
      const rule = rules.find((r) => r.target === block.command);
      const ruleResult = rule ? result?.results.find((r) => r.rule_id === rule.id) : undefined;
      return <CommandStepBlock block={block} passed={!!ruleResult?.passed} points={rule?.points} />;
    }
    case 'quiz': {
      const rule = rules.find((r) => r.target === block.id);
      const ruleResult = rule ? result?.results.find((r) => r.rule_id === rule.id) : undefined;
      return (
        <QuizBlock
          block={block}
          passed={!!ruleResult?.passed}
          answered={!!ruleResult}
          points={rule?.points}
          selected={quizAnswers?.[block.id]}
          onSelect={(optionId) => onQuizAnswer?.(block.id, optionId)}
          locked={!!quizLocked}
        />
      );
    }
    case 'checkpoint':
      return null;
    default:
      return null;
  }
};
