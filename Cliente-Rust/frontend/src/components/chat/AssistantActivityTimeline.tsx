import React from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import type { ChatAppearance } from './ChatMessageList';
import type { AgentStep, ChatMode } from '../chatModes/types';
import {
  formatAgentToolDetail,
  formatAgentToolLabel,
  toolCallInputFromStep,
} from '../../utils/agentToolLabels';

export type TimelineEntryStatus = 'pending' | 'active' | 'done';

export interface TimelineEntry {
  id: string;
  label: string;
  detail?: string;
  status: TimelineEntryStatus;
}

function appendToolEntries(
  items: TimelineEntry[],
  toolSteps: AgentStep[],
  isActive: boolean,
) {
  let i = 0;
  while (i < toolSteps.length) {
    const step = toolSteps[i];
    if (step.kind === 'thinking') {
      i += 1;
      continue;
    }
    if (step.kind !== 'tool_call') {
      i += 1;
      continue;
    }

    const name = step.name ?? 'herramienta';
    const input = toolCallInputFromStep(step);
    const next = toolSteps[i + 1];
    const hasResult = next?.kind === 'tool_result' && next.name === step.name;
    const isRunning = !hasResult && isActive;
    const status: TimelineEntryStatus = hasResult ? 'done' : isRunning ? 'active' : 'done';
    const phase = hasResult || !isRunning ? 'done' : 'running';

    items.push({
      id: `tool-${i}`,
      label: formatAgentToolLabel(name, input, phase),
      detail: formatAgentToolDetail(
        name,
        input,
        hasResult ? next.output : undefined,
        phase,
      ),
      status,
    });

    i += hasResult ? 2 : 1;
  }
}

export function buildAssistantTimeline(params: {
  mode: ChatMode;
  isActive: boolean;
  hasStreamedText: boolean;
  toolSteps?: AgentStep[];
}): TimelineEntry[] {
  const { mode, isActive, hasStreamedText, toolSteps = [] } = params;
  const items: TimelineEntry[] = [];

  const hasTools = toolSteps.length > 0;
  const thinkDone = hasStreamedText || hasTools || !isActive;

  items.push({
    id: 'think',
    label: 'Analizando tu pregunta',
    status: isActive && !thinkDone ? 'active' : thinkDone ? 'done' : 'pending',
  });

  if (mode === 'agente' || mode === 'plan') {
    const waitingApi = isActive && !hasTools && !hasStreamedText;
    items.push({
      id: 'server',
      label: mode === 'plan' ? 'Inspeccionando el servidor' : 'Conectando con el agente',
      status: waitingApi ? 'active' : hasTools || hasStreamedText || !isActive ? 'done' : 'pending',
    });
  }

  appendToolEntries(items, toolSteps, isActive);

  if (isActive || hasStreamedText) {
    items.push({
      id: 'answer',
      label: isActive
        ? hasStreamedText
          ? 'Generando respuesta'
          : hasTools
            ? 'Preparando respuesta'
            : 'Esperando respuesta'
        : 'Respuesta lista',
      status: isActive ? (hasStreamedText ? 'active' : 'pending') : 'done',
    });
  }

  return items;
}

interface AssistantActivityTimelineProps {
  appearance?: ChatAppearance;
  entries: TimelineEntry[];
}

function StatusIcon({
  status,
  isLanding,
}: {
  status: TimelineEntryStatus;
  isLanding: boolean;
}) {
  const base =
    'flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0';
  if (status === 'done') {
    return (
      <span
        className={`${base} ${isLanding ? 'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]' : 'bg-accent/20 text-accent'}`}
        aria-hidden
      >
        <Check size={12} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span
        className={`${base} ${isLanding ? 'bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] text-[var(--accent-primary)]' : 'bg-accent/15 text-accent'}`}
        aria-hidden
      >
        <Loader2 size={12} className="animate-spin" />
      </span>
    );
  }
  return (
    <span
      className={`${base} ${isLanding ? 'bg-[var(--background-tertiary)] text-[var(--text-muted)]' : 'bg-white/5 text-white/30'}`}
      aria-hidden
    >
      <Circle size={10} />
    </span>
  );
}

export default function AssistantActivityTimeline({
  appearance = 'session',
  entries,
}: AssistantActivityTimelineProps) {
  const isLanding = appearance === 'landing';
  if (entries.length === 0) return null;

  const labelClass = (status: TimelineEntryStatus) => {
    if (isLanding) {
      const baseColor = status === 'pending' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]';
      return `text-[12px] font-medium ${baseColor}`;
    }
    if (status === 'active') return 'text-[12px] font-medium text-white/90';
    if (status === 'done') return 'text-[12px] font-medium text-white/70';
    return 'text-[12px] font-medium text-white/40';
  };

  return (
    <div
      className={isLanding ? 'py-[2px] pb-1' : 'mb-2'}
      role="status"
      aria-live="polite"
      aria-label="Actividad del asistente"
    >
      <ol className={isLanding ? 'm-0 p-0 list-none flex flex-col' : 'm-0 p-0 list-none flex flex-col'}>
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          return (
            <li
              key={entry.id}
              className={`relative flex gap-2.5 py-1.5 ${!isLanding && !isLast ? 'pb-2' : ''}`}
            >
              {!isLast && (
                <span
                  className={
                    isLanding
                      ? 'absolute left-[9px] top-[26px] bottom-[-2px] w-px bg-[var(--border-subtle)]'
                      : 'absolute left-[8px] top-[22px] bottom-0 w-px bg-white/10'
                  }
                  aria-hidden
                />
              )}
              <StatusIcon status={entry.status} isLanding={isLanding} />
              <div className="min-w-0 flex-1">
                <span className={labelClass(entry.status)}>{entry.label}</span>
                {entry.detail && (
                  <span
                    className={
                      isLanding
                        ? 'block text-[10px] text-[var(--text-muted)] mt-0.5 font-mono break-words whitespace-pre-wrap leading-[1.35]'
                        : 'block text-[10px] text-white/40 mt-0.5 font-mono break-all whitespace-pre-wrap'
                    }
                    title={entry.detail}
                  >
                    {entry.detail}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
