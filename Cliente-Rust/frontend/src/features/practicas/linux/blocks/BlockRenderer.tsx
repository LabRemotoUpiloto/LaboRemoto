// features/practicas/linux/blocks/BlockRenderer.tsx
//
// Despacha cada bloque del módulo (ver linuxPractice.service.ts) a su propio
// componente. `checkpoint` no renderiza nada acá — es leído por
// LinuxModulePage para saber cuándo mostrar la pantalla de cierre.

import React, { useEffect, useState } from 'react';
import { Paper, Text, Stack, Group, Checkbox, Radio, Loader, Alert, ActionIcon, Button } from '@mantine/core';
import { AlertTriangle, Check, Image as ImageIcon, Lightbulb, Maximize2, Monitor, Play, SquareTerminal, X } from 'lucide-react';
import '../pasos.css';
import type { LinuxBlock, LinuxValidationResult, LinuxValidationRule } from '../../linuxPractice.service';
import { linuxGetMedia, linuxGetMediaUrl } from '../../linuxPractice.service';
import { ZoomableImage } from '../ZoomableImage';
import { pedirEjecutarComando } from '../ejecutarComando';
import {
  EVENTO_ACCION_ESCRITORIO, accionEscritorioHecha, detenerEscritorio, marcarAccionEscritorio, pedirVista,
} from '../escritorioPractica';
import { WheelsSimBlock } from './widgets/WheelsSim';
import { CalculatorBlock } from './widgets/CalculatorBlock';
import { SensorDemoBlock } from './widgets/SensorDemo';
import { StateMachineBlock } from './widgets/StateMachineBlock';
import { ChecklistBlock } from './widgets/ChecklistBlock';

const PALETTE = ['#4caf50', '#5b9bd5', '#e0a94a', '#e57373', '#a78bfa'];

/** Soporte mínimo de *cursiva* y `código`; los **…** se muestran como texto normal (sin resaltar). */
function renderInline(md: string): React.ReactNode {
  const parts = md.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <React.Fragment key={i}>{part.slice(2, -2)}</React.Fragment>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} style={{ fontFamily: 'monospace', fontSize: '0.92em', padding: '1px 5px', borderRadius: 4, background: 'rgba(127,127,127,0.18)' }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Fragmento de código (hoy Python para los módulos de EV3). Solo se muestra: no se ejecuta. */
function CodeBlockView({ block }: { block: Extract<LinuxBlock, { type: 'code_block' }> }) {
  return (
    <Paper withBorder radius="md" p="md" style={{ background: '#14150F' }}>
      <Text component="pre" ff="monospace" fz="sm" m={0} style={{ color: '#E5E9DE', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
        {block.code}
      </Text>
      {block.caption && (
        <Text fz="xs" mt="xs" style={{ color: '#9AA38F' }}>
          {block.caption}
        </Text>
      )}
    </Paper>
  );
}

/** Evento de documento con el que el botón avisa al chat que abra el freno (`detail.id`). */
export const STEP_GATE_EVENT = 'linux:gate-open';

function StepGateBlock({ block }: { block: Extract<LinuxBlock, { type: 'step_gate' }> }) {
  const [opened, setOpened] = useState(false);
  return (
    <Group justify="flex-start">
      <Button
        size="xs"
        variant={opened ? 'subtle' : 'light'}
        disabled={opened}
        onClick={() => {
          setOpened(true);
          document.dispatchEvent(new CustomEvent(STEP_GATE_EVENT, { detail: { id: block.id } }));
        }}
      >
        {opened ? 'Listo' : (block.label ?? 'Listo, sigue')}
      </Button>
    </Group>
  );
}

/** Clase que hace latir el elemento que toca usar ahora (ver pasos.css). */
export const CLASE_RESALTADA = 'paso-resaltado';

/** Repinta el bloque cuando una acción del escritorio queda hecha (el estado vive en escritorioPractica). */
function useAccionEscritorio(id: string): boolean {
  const [hecha, setHecha] = useState(() => accionEscritorioHecha(id));
  useEffect(() => {
    const alHacerse = (ev: Event) => {
      if ((ev as CustomEvent<{ id: string }>).detail?.id === id) setHecha(true);
    };
    document.addEventListener(EVENTO_ACCION_ESCRITORIO, alHacerse);
    return () => document.removeEventListener(EVENTO_ACCION_ESCRITORIO, alHacerse);
  }, [id]);
  return hecha;
}

/**
 * Tarea en el escritorio remoto: abrir un programa en la interfaz gráfica. No tiene botón de «listo»: PasoCard le
 * pregunta a la Pi si la ventana está abierta y la marca hecha. Aquí solo va la consigna, el estado y cómo volver a
 * ver el escritorio si el estudiante se fue a la terminal.
 */
function DesktopTaskBlock({ block, resaltar }: { block: Extract<LinuxBlock, { type: 'desktop_task' }>; resaltar?: boolean }) {
  const hecha = useAccionEscritorio(block.id);
  return (
    <Paper withBorder radius="md" p="md" className={resaltar && !hecha ? CLASE_RESALTADA : undefined}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Monitor size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <Stack gap={8} style={{ flex: 1 }}>
          <Text fz="sm" style={{ lineHeight: 1.6 }}>{renderInline(block.goal_md)}</Text>
          {hecha ? (
            <Group gap={6} wrap="nowrap">
              <Check size={16} color="var(--success, #22C55E)" />
              <Text fz="sm" fw={600}>{block.done_md ?? '¡Listo! Abriste la terminal dentro del escritorio.'}</Text>
            </Group>
          ) : (
            <Group gap="sm">
              <Loader size="xs" />
              <Text fz="xs" c="dimmed">Esperando a que la abras…</Text>
              <Button size="compact-xs" variant="light" leftSection={<Monitor size={13} />} onClick={() => pedirVista('escritorio')}>
                Ver el escritorio
              </Button>
            </Group>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}

/** Cierra el escritorio remoto (libera la memoria de la Pi) y vuelve a la terminal de la práctica. */
function DesktopCloseBlock({ block, sessionId, resaltar, onHecho }: {
  block: Extract<LinuxBlock, { type: 'desktop_close' }>;
  sessionId?: string | null;
  resaltar?: boolean;
  onHecho?: () => void;
}) {
  const hecha = useAccionEscritorio(block.id);
  if (hecha) {
    return (
      <Group gap={6} wrap="nowrap">
        <Check size={16} color="var(--success, #22C55E)" />
        <Text fz="sm" c="dimmed">Cerraste el escritorio: sigues en la misma Raspberry, ahora escribiendo.</Text>
      </Group>
    );
  }
  return (
    <Group>
      <Button
        leftSection={<SquareTerminal size={15} />}
        className={resaltar ? CLASE_RESALTADA : undefined}
        onClick={() => {
          pedirVista('terminal');
          if (sessionId) detenerEscritorio(sessionId);
          marcarAccionEscritorio(block.id);
          onHecho?.();
        }}
      >
        {block.label ?? 'Cerrar el escritorio y volver a la terminal'}
      </Button>
    </Group>
  );
}

/** Cada texto se pinta según el papel que le da el module.json (`kind`, ver LinuxTextKind). */
function TextBlockView({ block }: { block: Extract<LinuxBlock, { type: 'text' }> }) {
  const kind = block.kind ?? 'body';
  return (
    <div className={`paso-texto paso-texto--${kind}`}>
      {kind === 'tip' && <Lightbulb size={15} className="paso-texto__icono" aria-hidden />}
      <div className="paso-texto__cuerpo">
        {kind === 'recap' && <span className="paso-texto__rotulo">Repaso</span>}
        <p>{renderInline(block.body_md)}</p>
      </div>
    </div>
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
      {block.title ? (
        <Text fz="sm" fw={700} c="teal" mb={8}>
          {block.title}
        </Text>
      ) : (
        <Text fz="xs" tt="uppercase" fw={700} c="teal" mb={8} style={{ letterSpacing: '0.06em' }}>
          {block.term}
        </Text>
      )}
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
  resaltar,
  practiceId,
}: {
  block: Extract<LinuxBlock, { type: 'command_step' }>;
  passed: boolean;
  resaltar?: boolean;
  practiceId: string;
}) {
  // Antes era un checkbox con el comando y una línea gris: parecía algo para
  // marcar con el mouse y no se entendía que había que ir a la terminal. Lo
  // que hay que hacer lo dice la franja «Ahora:» del paso (PasoCard).
  return (
    <Stack gap={8}>
      <Text fz="sm" style={{ lineHeight: 1.6 }}>
        {renderInline(block.goal_md ?? block.explain_md)}
      </Text>
      {!block.goal_md && (
        <Text
          ff="monospace"
          fz="md"
          fw={600}
          px="sm"
          py={8}
          className={resaltar ? CLASE_RESALTADA : undefined}
          style={{ background: '#14150F', color: '#E5E9DE', borderRadius: 6, wordBreak: 'break-all', border: '1px solid transparent' }}
        >
          <span style={{ color: '#7f8a6f', userSelect: 'none' }}>$ </span>{block.command}
        </Text>
      )}
      {block.goal_md && <Text fz="xs" c="dimmed">{renderInline(block.explain_md)}</Text>}
      {block.ejecutable && !passed && (
        <Group gap="sm" wrap="nowrap" align="center">
          <Button
            size="xs"
            variant="light"
            leftSection={<Play size={13} />}
            onClick={() => pedirEjecutarComando(practiceId, block.command)}
            style={{ flexShrink: 0 }}
          >
            Ejecutar comando
          </Button>
          {block.nota_ejecutar_md && (
            <Text fz="xs" c="dimmed" style={{ lineHeight: 1.45 }}>
              {renderInline(block.nota_ejecutar_md)}
            </Text>
          )}
        </Group>
      )}
      <Text fz="xs" c={passed ? 'teal' : 'dimmed'}>
        {passed ? 'Hecho. El comando funcionó.' : 'Cuando lo escribas bien en la terminal, este paso se marca solo.'}
      </Text>
    </Stack>
  );
}

// `invoke` rechaza con el payload del backend ({ code, message, ... }), no con un Error:
// String(e) daba "[object Object]" en pantalla.
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  try { return JSON.stringify(e); } catch { return String(e); }
}

function MediaBlock({
  block,
  practiceId,
  resaltar,
  onAbierto,
}: {
  block: Extract<LinuxBlock, { type: 'media' }>;
  practiceId: string;
  /** Hace latir el botón que la abre: es lo que toca hacer ahora. */
  resaltar?: boolean;
  /** Avisa que el estudiante la abrió (ampliar la imagen o darle a ver el video). */
  onAbierto?: () => void;
}) {
  // Los videos pesan varios MB y cada alumno los baja completos por el túnel de la
  // Pi: con un curso entero abriendo la práctica a la vez saturan el enlace. Por eso
  // el video solo se pide cuando el estudiante lo pide (botón); las imágenes, que son
  // chicas, se siguen cargando de inmediato.
  const [requested, setRequested] = useState(block.kind !== 'video');
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; url: string } | { status: 'error'; message: string }>({ status: 'loading' });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setRequested(block.kind !== 'video');
  }, [practiceId, block.file, block.kind]);

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    setState({ status: 'loading' });
    setExpanded(false);
    // Video: URL del puente local -> streaming con Range (arranca en segundos). Imagen: archivo
    // chico, se trae completo como data: URI.
    const cargar = block.kind === 'video'
      ? linuxGetMediaUrl(practiceId, block.file)
      : linuxGetMedia(practiceId, block.file).then((media) => `data:${media.mime};base64,${media.base64}`);
    cargar
      .then((url) => {
        if (cancelled) return;
        setState({ status: 'ok', url });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: 'error', message: errorMessage(e) });
      });
    return () => { cancelled = true; };
  }, [practiceId, block.file, requested]);

  // Sin caja propia (ya vive dentro de la burbuja del mensaje): un encabezado que dice qué es
  // y el medio con su propio marco redondeado. Los módulos guardan los diagramas en `diagrams/`.
  const tipo = block.kind === 'video' ? 'Video' : /^diagrams?\//i.test(block.file) ? 'Diagrama' : 'Imagen';
  return (
    <figure className="paso-media">
      <figcaption className="paso-media__cabecera">
        <span className="paso-media__tipo">
          {block.kind === 'video' ? <Play size={11} strokeWidth={2.6} /> : <ImageIcon size={11} strokeWidth={2.6} />}
          {tipo}
        </span>
        {block.caption && <span className="paso-media__titulo">{block.caption}</span>}
      </figcaption>
      {!requested && (
        <div className="paso-media__portada">
          <Button
            leftSection={<Play size={16} />}
            className={resaltar ? CLASE_RESALTADA : undefined}
            onClick={() => { setRequested(true); onAbierto?.(); }}
          >
            Ver video
          </Button>
        </div>
      )}
      {requested && state.status === 'loading' && (
        <div className="paso-media__portada paso-media__portada--cargando">
          <Loader size="sm" />
          <Text fz="xs" c="dimmed">Cargando…</Text>
        </div>
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
            expanded ? (
              <ZoomableImage
                src={state.url}
                alt={block.caption ?? block.file}
                style={{ maxWidth: '92vw', maxHeight: '85vh', borderRadius: 8 }}
              />
            ) : (
              <div style={{ position: 'relative' }}>
                <img
                  src={state.url}
                  alt={block.caption ?? block.file}
                  onClick={() => { setExpanded(true); onAbierto?.(); }}
                  className="paso-media__img"
                />
                {/* Que se puede ampliar no se adivinaba por el cursor: se dice con un botón. */}
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<Maximize2 size={14} />}
                  className={resaltar ? CLASE_RESALTADA : undefined}
                  style={{ position: 'absolute', right: 8, bottom: 8 }}
                  onClick={() => { setExpanded(true); onAbierto?.(); }}
                >
                  Ampliar imagen
                </Button>
              </div>
            )
          ) : (
            <video
              src={state.url}
              controls
              autoPlay
              preload="metadata"
              onError={() => setState({ status: 'error', message: 'No se pudo reproducir el video (¿sin conexión con la Pi?). Probá de nuevo en un momento.' })}
              onPlay={() => setExpanded(true)}
              style={{
                width: expanded ? 'auto' : '100%',
                maxWidth: expanded ? '92vw' : undefined,
                maxHeight: expanded ? '80vh' : undefined,
                borderRadius: expanded ? 8 : 10,
                aspectRatio: expanded ? undefined : '16 / 9',
                background: '#000',
              }}
            />
          )}
          {/* En línea el título ya va arriba; en pantalla completa se repite abajo. */}
          {expanded && block.caption && (
            <Text fz="sm" c="gray.3" mt={8} ta="center">{block.caption}</Text>
          )}
        </div>
      )}
    </figure>
  );
}

function QuizBlock({
  block,
  passed,
  answered,
  selected,
  onSelect,
  attempted,
  etiqueta,
  resaltar,
}: {
  block: Extract<LinuxBlock, { type: 'quiz' }>;
  /** «Pregunta 2 de 4». */
  etiqueta?: string;
  resaltar?: boolean;
  passed: boolean;
  answered: boolean;
  selected?: string;
  onSelect: (optionId: string) => void;
  /** Ya se envió la evaluación al menos una vez -- antes de eso no hay feedback que mostrar. */
  attempted: boolean;
}) {
  const showFeedback = attempted && answered;
  // La evaluación completa exige el 100% (ver validation.py) -- una pregunta
  // CORRECTA se bloquea (ya no tiene sentido tocarla), pero una INCORRECTA
  // queda editable a propósito, para que el estudiante la corrija y reenvíe.
  const locked = passed;
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      className={resaltar ? CLASE_RESALTADA : undefined}
      style={showFeedback ? { borderColor: passed ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)' } : undefined}
    >
      {etiqueta && <Text fz="xs" c="dimmed" mb={4}>{etiqueta}</Text>}
      <Group justify="space-between" align="flex-start" mb={8}>
        <Text fz="sm" fw={600} style={{ lineHeight: 1.5 }}>{renderInline(block.question_md)}</Text>
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
          {passed ? 'Correcto.' : 'Esta no es la respuesta correcta. Elige otra opción y vuelve a pulsar «Reenviar evaluación».'}
        </Text>
      )}
    </Paper>
  );
}

const PERMISSION_GROUPS = ['Dueño', 'Grupo', 'Otros'] as const;
const PERMISSION_BITS = [
  { key: 'r', label: 'Leer', value: 4 },
  { key: 'w', label: 'Escribir', value: 2 },
  { key: 'x', label: 'Ejecutar', value: 1 },
] as const;

function parseOctalDigit(digit: string): boolean[] {
  const n = parseInt(digit, 8) || 0;
  return [!!(n & 4), !!(n & 2), !!(n & 1)];
}

/**
 * Exploración libre, sin validation_rule propia -- lo que valida el progreso
 * es el `chmod` real que el estudiante corre después en la terminal (bloque
 * `command_step` aparte). Esto es solo para que entienda de dónde sale el
 * número antes de escribirlo a ciegas: toca los 9 checkboxes y ve en vivo
 * cómo cambian el octal y la notación simbólica.
 */
function PermissionsCalculatorBlock({ block }: { block: Extract<LinuxBlock, { type: 'permissions_calculator' }> }) {
  const initial = (block.initial_octal ?? '644').padStart(3, '0').slice(-3);
  const [bits, setBits] = useState<boolean[][]>(() => initial.split('').map(parseOctalDigit));

  const toggle = (groupIdx: number, bitIdx: number) => {
    setBits((prev) => {
      const next = prev.map((row) => [...row]);
      next[groupIdx][bitIdx] = !next[groupIdx][bitIdx];
      return next;
    });
  };

  const digits = bits.map((row) => row.reduce((sum, on, i) => sum + (on ? PERMISSION_BITS[i].value : 0), 0));
  const octal = digits.join('');
  const symbolic = bits.map((row) => row.map((on, i) => (on ? PERMISSION_BITS[i].key : '-')).join('')).join('');

  return (
    <Paper withBorder radius="md" p="md">
      {block.prompt_md && (
        <Text fz="sm" mb="sm">{renderInline(block.prompt_md)}</Text>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(3, 1fr)', gap: 8, alignItems: 'center' }}>
        <div />
        {PERMISSION_BITS.map((b) => (
          <Text key={b.key} fz="xs" c="dimmed" ta="center" tt="uppercase" fw={600}>
            {b.label}
          </Text>
        ))}
        {PERMISSION_GROUPS.map((group, gi) => (
          <React.Fragment key={group}>
            <Text fz="xs" fw={600}>{group}</Text>
            {PERMISSION_BITS.map((b, bi) => (
              <Group key={b.key} justify="center">
                <Checkbox checked={bits[gi][bi]} onChange={() => toggle(gi, bi)} />
              </Group>
            ))}
          </React.Fragment>
        ))}
      </div>
      <Stack gap={6} mt="md" p="sm" style={{ background: 'var(--background-tertiary, rgba(255,255,255,0.04))', borderRadius: 8 }}>
        <Group gap="xs">
          <Text fz="xs" c="dimmed" style={{ minWidth: 78 }}>Simbólico</Text>
          <Text ff="monospace" fz="sm">{symbolic}</Text>
        </Group>
        <Group gap="xs">
          <Text fz="xs" c="dimmed" style={{ minWidth: 78 }}>Comando</Text>
          <Text ff="monospace" fz="sm">chmod {octal} archivo</Text>
        </Group>
      </Stack>
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
  /** Hace latir lo que toca usar ahora en este bloque (botón de la media, comando, pregunta). */
  resaltar?: boolean;
  /** El estudiante abrió la media (ver PasoCard). */
  onAbierto?: () => void;
  /** Sesión SSH de la práctica: la usa `desktop_close` para apagar su escritorio remoto. */
  sessionId?: string | null;
  /** «Pregunta 2 de 4». */
  etiqueta?: string;
}

export const BlockView: React.FC<BlockViewProps> = ({ block, rules, result, practiceId, quizAnswers, onQuizAnswer, quizLocked, resaltar, onAbierto, sessionId, etiqueta }) => {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} />;
    case 'terminal_annotation':
      return <TerminalAnnotationBlock block={block} />;
    case 'code_block':
      return <CodeBlockView block={block} />;
    case 'wheels_sim':
      return <WheelsSimBlock block={block} />;
    case 'calculator':
      return <CalculatorBlock block={block} />;
    case 'sensor_demo':
      return <SensorDemoBlock block={block} />;
    case 'state_machine':
      return <StateMachineBlock block={block} />;
    case 'checklist':
      return <ChecklistBlock block={block} />;
    case 'analogy':
      return <AnalogyBlock block={block} />;
    case 'media':
      return <MediaBlock block={block} practiceId={practiceId} resaltar={resaltar} onAbierto={onAbierto} />;
    case 'command_step': {
      const rule = rules.find((r) => r.id === block.rule_id) ?? rules.find((r) => r.target === block.command);
      const ruleResult = rule ? result?.results.find((r) => r.rule_id === rule.id) : undefined;
      return <CommandStepBlock block={block} passed={!!ruleResult?.passed} resaltar={resaltar} practiceId={practiceId} />;
    }
    case 'quiz': {
      const rule = rules.find((r) => r.target === block.id);
      const ruleResult = rule ? result?.results.find((r) => r.rule_id === rule.id) : undefined;
      return (
        <QuizBlock
          block={block}
          passed={!!ruleResult?.passed}
          answered={!!ruleResult}
          selected={quizAnswers?.[block.id]}
          onSelect={(optionId) => onQuizAnswer?.(block.id, optionId)}
          attempted={!!quizLocked}
          etiqueta={etiqueta}
          resaltar={resaltar}
        />
      );
    }
    case 'permissions_calculator':
      return <PermissionsCalculatorBlock block={block} />;
    case 'step_gate':
      return <StepGateBlock block={block} />;
    case 'desktop_task':
      return <DesktopTaskBlock block={block} resaltar={resaltar} />;
    case 'desktop_close':
      return <DesktopCloseBlock block={block} sessionId={sessionId} resaltar={resaltar} onHecho={onAbierto} />;
    case 'checkpoint':
      return null;
    default:
      return null;
  }
};
