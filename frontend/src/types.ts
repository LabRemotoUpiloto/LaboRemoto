/**
 * types.ts
 *
 * Definiciones de tipos globales del frontend.
 * Todos los tipos compartidos entre múltiples componentes/hooks deben vivir aquí.
 *
 * Convención de naming:
 *  - Interfaces de datos del backend: PascalCase (ej. SshSessionInfo)
 *  - Tipos de UI/estado: PascalCase con sufijo descriptivo (ej. TabItem, AppPanel)
 */

// ── FS ────────────────────────────────────────────────────────────────────────

export interface SshCredentials {
  host: string;
  port: number;
  username: string;
  password?: string;
}

export interface SftpEntry {
  name: string;
  path: string;
  kind: string;
  size?: number;
  perms?: string;
  mtime?: number;
}

export interface LocalEntry {
  name: string;
  path: string;
  kind: string;
  size?: number;
  mtime?: number;
}

// ── Sesiones y Tabs ───────────────────────────────────────────────────────────

/** Un tab de la barra superior puede ser de inicio, sesión SSH, o log de sesión. */
export type TabType = 'home' | 'session' | 'log';

export interface TabItem {
  id: string;
  label: string;
  type: TabType;
}

/** Metadata de una sesión activa (host, puerto, usuario, etc.) */
export interface SessionMeta {
  host: string;
  port: number;
  user: string;
}

// ── Prácticas de Laboratorio ──────────────────────────────────────────────────

export interface PracticeLaunchStudent {
  id: number;
  username: string;
  fullname: string;
  email: string;
}

export interface PracticeLaunchPayload {
  practice: PracticeConfig;
  student: PracticeLaunchStudent;
}

export interface PracticeConfig {
  id: string;
  name: string;
  moodle_assignment_id?: number;
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  terminal?: {
    working_directory?: string;
  };
  panels?: {
    camera?: boolean;
    chat?: boolean;
    chat_context?: string;
    chat_tutorial?: string;
  };
}

export interface PracticeSessionMeta {
  practiceId: string;
  assignmentId?: number;
  student: PracticeLaunchStudent;
}

// ── Paneles de Vista ──────────────────────────────────────────────────────────

/** IDs de los paneles del sistema de doble header. */
export type PanelId =
  | 'landing'
  | 'connect'
  | 'hosts'
  | 'themes'
  | 'logs'
  | 'sftp'
  | 'snippets'
  | 'practices'
  | 'terminal'
  | 'moodle-test';

/** Vista activa dentro de una sesión (terminal o escritorio gráfico). */
export type SessionView = 'terminal' | 'desktop';

// ── Hosts guardados ───────────────────────────────────────────────────────────

export interface RecentConnection {
  host: string;
  port: number;
  user: string;
  timestamp?: number;
}

export interface SavedHostPayload {
  host: string;
  port: number;
  user: string;
  password: string;
  name?: string;
  _originalFile?: string;
  autoConnect?: boolean;
}
