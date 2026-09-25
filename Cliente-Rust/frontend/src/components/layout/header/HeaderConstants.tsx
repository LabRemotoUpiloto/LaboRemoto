import React from 'react';

// SVG icons for panel tabs (H1)
export const PANEL_ICONS: Record<string, React.ReactNode> = {
  terminal: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  sftp: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><path d="M2 10.5V4l2-2h5l1.5 1.5V10.5a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2" /><path d="M4 2v2.5H2" stroke="currentColor" strokeWidth="1.2" /><path d="M7 5v4M5.5 7.5L7 9l1.5-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  logs: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><path d="M2 4h8M2 6.5h5M2 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
  ),
  pines: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="6" y="3" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6h4M2 9h4M2 12h4M2 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M14 6h4M14 9h4M14 12h4M14 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  domotica: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M3 9.5L10 4l7 5.5V16a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="10" cy="11.5" r="1.4" fill="currentColor" />
      <path d="M10 13v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  camara: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><rect x="1" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" /><path d="M8 5l3-1.5v5L8 7V5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>
  ),
  escritorio: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><rect x=".5" y="1" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M3.5 10.5h5M6 8.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
  ),
  snippets: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><polyline points="8 9 11 6 8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><polyline points="4 3 1 6 4 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  themes: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" /><circle cx="5" cy="4.5" r=".6" fill="currentColor" /><circle cx="7.5" cy="5.5" r=".6" fill="currentColor" /><circle cx="4.5" cy="6.5" r=".6" fill="currentColor" /></svg>
  ),
  hosts: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" /><polygon points="8.5 4 7 7 4 8.5 5 5 8.5 4" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
  ),
  connect: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  practices: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M7.5 2.5v6L5 14a1 1 0 0 0 .9 1.5h8.2a1 1 0 0 0 .9-1.5L12.5 8.5v-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 2.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M5.5 11h9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="9" cy="13" r=".75" fill="currentColor"/>
      <circle cx="12" cy="14.2" r=".75" fill="currentColor"/>
    </svg>
  ),
  landing: (
    <svg viewBox="0 0 12 12" fill="none" width="100%" height="100%"><path d="M1.5 4.5L6 1l4.5 3.5v6a1 1 0 01-1 1H2.5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2" /><path d="M4.5 10.5v-4h3v4" stroke="currentColor" strokeWidth="1.1" /></svg>
  ),
};

export const PANEL_LABELS: Record<string, string> = {
  landing: 'Inicio',
  terminal: 'Terminal',
  sftp: 'SFTP',
  hosts: 'Hosts',
  practices: 'Prácticas',
  connect: 'Connect',
  logs: 'Logs',
  themes: 'Temas',
  snippets: 'Snippets',
  pines: 'Pines',
  camara: 'Cámara',
  escritorio: 'Escritorio'
};

import { X } from 'lucide-react';

export const CloseIcon = ({ size = 12 }: { size?: number }) => (
  <X size={size} strokeWidth={2.5} />
);

export type Tab = { id: string; type: 'home' | 'session' | 'log'; label: string };
