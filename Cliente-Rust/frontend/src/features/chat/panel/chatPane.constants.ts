// Constantes, helpers y configuración para el panel de chat.
// Extraído de ChatPane.tsx para mejorar la modularidad.

import React from 'react';
import { ChatMode } from '../modos/types';

// ── Claves de localStorage ──
export const CHAT_STORAGE_KEY = (sid: string | null, mode: ChatMode) =>
  `chat-history:${sid ?? 'default'}:${mode}`;

export const MAX_CHAR_WARN = 4000;

export interface HistoryEntry {
  id: string;
  date: number;
  preview: string;
  messageCount: number;
  mode?: string;
  messages: { id: string; sender: string; text: string; timestamp?: number }[];
}

// ── Formateador de timestamps ──
export const fmtTime = (ts?: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'ahora';
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ── Modos del chat ──
export const MODES: { value: ChatMode; label: string; color: string }[] = [
  { value: 'ask',    label: 'Consulta', color: '#4ade80' },
  { value: 'agente', label: 'Agente',   color: '#60a5fa' },
  { value: 'plan',   label: 'Plan',     color: '#f59e0b' },
];

// ── Iconos SVG por modo ──
export const ModeIcons: Record<string, React.ReactNode> = {
  ask: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
  ),
  agente: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('polyline', { points: '4 17 10 11 4 5' }),
    React.createElement('line', { x1: 12, y1: 19, x2: 20, y2: 19 })
  ),
  plan: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('line', { x1: 8, y1: 6, x2: 21, y2: 6 }),
    React.createElement('line', { x1: 8, y1: 12, x2: 21, y2: 12 }),
    React.createElement('line', { x1: 8, y1: 18, x2: 21, y2: 18 }),
    React.createElement('line', { x1: 3, y1: 6, x2: '3.01', y2: 6 }),
    React.createElement('line', { x1: 3, y1: 12, x2: '3.01', y2: 12 }),
    React.createElement('line', { x1: 3, y1: 18, x2: '3.01', y2: 18 })
  ),
};

// ── Placeholders contextuales por modo ──
export const MODE_PLACEHOLDERS: Record<ChatMode, string> = {
  ask:    'Pregunta lo que quieras sobre tu servidor…',
  agente: 'Describe qué quieres que ejecute o investigue…',
  plan:   'Describe el objetivo para generar un plan…',
};

// ── Sugerencias rápidas por modo (welcome state) ──

// ── Patrones de error del terminal ──
export const ERROR_PATTERNS: RegExp[] = [
  /bash:.*command not found/i,
  /Failed to (start|restart|stop|reload)/i,
  /Job for .* failed/i,
  /Permission denied/i,
  /No such file or directory/i,
  /fatal:/i,
  /Traceback \(most recent call last\)/i,
  /npm ERR!/i,
  /pip.*[Ee]rror/i,
  /syntax error/i,
  /cannot (access|connect|open|find)/i,
  /\[error\]/i,
  /Error:/,
];

// ── Patrones de prompt interactivo (terminal bloqueada esperando respuesta) ──
export const PROMPT_PATTERNS: RegExp[] = [
  /\[y\/n\]/i,
  /\(y\/n\)/i,
  /\[yes\/no\]/i,
  /\(yes\/no\)/i,
  /\(Y\/I\/N\/O\/D\/Z\)/i,          // conffile prompt de dpkg
  /do you want to continue\?/i,
  /\[sudo\]\s*password/i,
  /^password:?\s*$/i,
  /enter passphrase/i,
  /press (enter|any key)/i,
  /press.*to continue/i,
  /<\s*(Ok|Yes|No|Cancel)\s*>/i,     // botones whiptail/dialog (ej. "Pending kernel upgrade")
  /--More--/,
];
