// Constantes, helpers y configuración para el panel de chat.
// Extraído de ChatPane.tsx para mejorar la modularidad.

import React from 'react';
import { ChatMode } from '../chatModes/types';

// ── Claves de localStorage ──
export const CHAT_STORAGE_KEY = (sid: string | null, mode: ChatMode) =>
  `chat-history:${sid ?? 'default'}:${mode}`;

export const TOKEN_STORAGE_KEY = (sid: string | null) =>
  `chat-tokens:${sid ?? 'default'}`;

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
export const MODE_SUGGESTIONS: Record<ChatMode, { text: string; icon: React.ReactNode }[]> = {
  ask: [
    { text: '¿Cómo reinicio un servicio?', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('circle', { cx: 12, cy: 12, r: 10 }), React.createElement('path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }), React.createElement('line', { x1: 12, y1: 17, x2: '12.01', y2: 17 })) },
    { text: '¿Qué es SSH y cómo funciona?', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }), React.createElement('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' })) },
    { text: 'Explica el comando top', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('polyline', { points: '4 17 10 11 4 5' }), React.createElement('line', { x1: 12, y1: 19, x2: 20, y2: 19 })) },
    { text: '¿Diferencia entre apt y snap?', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' })) },
  ],
  agente: [
    { text: 'Ver cuánto espacio queda en disco', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }), React.createElement('path', { d: 'M21 12c0 1.66-4 3-9 3s-9-1.34-9-3' }), React.createElement('path', { d: 'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5' })) },
    { text: 'Listar servicios activos', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('circle', { cx: 12, cy: 12, r: 3 }), React.createElement('path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' })) },
    { text: 'Ver los últimos errores del sistema', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }), React.createElement('polyline', { points: '14 2 14 8 20 8' }), React.createElement('line', { x1: 16, y1: 13, x2: 8, y2: 13 }), React.createElement('line', { x1: 16, y1: 17, x2: 8, y2: 17 })) },
    { text: 'Probar la conexión a internet', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('path', { d: 'M5 12.55a11 11 0 0 1 14.08 0' }), React.createElement('path', { d: 'M1.42 9a16 16 0 0 1 21.16 0' }), React.createElement('path', { d: 'M8.53 16.11a6 6 0 0 1 6.95 0' }), React.createElement('line', { x1: 12, y1: 20, x2: '12.01', y2: 20 })) },
  ],
  plan: [
    { text: 'Instalar y configurar Nginx', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('polygon', { points: '12 2 2 7 12 12 22 7 12 2' }), React.createElement('polyline', { points: '2 17 12 22 22 17' }), React.createElement('polyline', { points: '2 12 12 17 22 12' })) },
    { text: 'Mejorar la seguridad del servidor', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' })) },
    { text: 'Instalar Docker paso a paso', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' })) },
    { text: 'Monitorear el rendimiento del servidor', icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' })) },
  ],
};

export const MODE_DESCRIPTIONS: Record<ChatMode, string> = {
  ask:    'Explica, responde preguntas y genera código sin ejecutar nada',
  agente: 'Ejecuta comandos reales en el servidor y analiza el output',
  plan:   'Genera un plan estructurado por fases antes de ejecutar',
};

export const MODEL_CONTEXT_WINDOW: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'gpt-3.5-turbo': 16_384,
};

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
