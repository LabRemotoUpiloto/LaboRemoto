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

// SftpEntry y LocalEntry se generan automáticamente desde los structs Rust
// (backend/src/cmd/state/types.rs, #[derive(TS)]) vía ts-rs. No editar estos
// archivos manualmente — regenerar con `cargo test export_bindings --lib`
// desde Cliente-Rust/backend. Ver bindings/ para el resto de tipos disponibles.
export type { SftpEntry } from './bindings/SftpEntry';
export type { LocalEntry } from './bindings/LocalEntry';

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
    robot_dashboard?: boolean;
  };
}

export interface PracticeSessionMeta {
  practiceId: string;
  assignmentId?: number;
  student: PracticeLaunchStudent;
  /** true si la práctica trae dashboard de robot (Eve3 vía API) — ver ev3.service.ts. */
  robotDashboard?: boolean;
}

// Mismo shape que devuelve `practicas_list_categories` / `practicas_get_config`
// en Rust (cmd::practices::practicas::Practice). Los módulos de Linux y EV3 que
// sirve la Pi también llegan así, pero solo con metadata para la tarjeta.
export interface PracticeConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  setup_commands: unknown[];
}

export interface TerminalConfig {
  allowed_commands: string[];
  working_directory: string;
  allow_navigation: boolean;
  allow_nano: boolean;
}

export interface PanelConfig {
  camera: boolean;
  chat: boolean;
  chat_context: string;
  chat_tutorial: string;
  robot_dashboard: boolean;
}

export interface Practice {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  moodle_assignment_id?: number;
  connection: PracticeConnection;
  terminal: TerminalConfig;
  panels: PanelConfig;
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
