/**
 * linuxPractice.service.ts
 *
 * Capa de servicio para la práctica de Linux — habla con el backend Rust
 * (cmd/practices/linux_api.rs), que a su vez proxea al servicio HTTP que
 * corre en la Raspberry Pi. El frontend nunca llama directo a la Pi.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Tipos (reflejan linux_api.rs + el schema de bloques del servicio en la Pi) ──

export interface LinuxPracticeSummary {
  id: string;
  order?: number;
  title: string;
  difficulty: string;
  estimated_minutes?: number;
}

export interface LinuxConnectionTarget {
  host: string;
  port: number;
  user: string;
}

export interface LinuxLabel {
  span: string;
  label: string;
}

export interface LinuxQuizOption {
  id: string;
  label: string;
}

export type LinuxBlock =
  | { type: 'text'; id: string; body_md: string }
  | { type: 'terminal_annotation'; id: string; prompt_example: string; labels: LinuxLabel[] }
  | { type: 'analogy'; id: string; term: string; everyday: string; windows: string; linux: string }
  // `goal_md` (opcional): para desafíos abiertos -- la tarjeta muestra el
  // objetivo en lugar de `command`, que es la respuesta y no debe verse.
  | { type: 'command_step'; id: string; command: string; explain_md: string; goal_md?: string }
  // `file` es una ruta relativa dentro de content/<practice_id>/media/ en la
  // Pi (ej. "diagrams/pipe.png", "videos/demo.mp4") -- nunca una URL. El
  // cliente la pide vía practicas_linux_get_media, nunca le habla a la Pi
  // directo por HTTP.
  | { type: 'media'; id: string; kind: 'image' | 'video'; file: string; caption?: string }
  // La respuesta correcta NUNCA viaja acá -- solo id, la pregunta y las
  // opciones. La corrección vive server-side en la Pi (mismo patrón que ya
  // usa command_step: el "target" de la regla es opaco para el cliente).
  | { type: 'quiz'; id: string; question_md: string; options: LinuxQuizOption[] }
  // Widget de exploración libre (sin validation_rule propia -- lo que se
  // valida es el `chmod` real que el estudiante corre después en la
  // terminal, este bloque es solo para que entienda de dónde sale el
  // número). `initial_octal` arranca el grillado de checkboxes en ese
  // valor (default "644" si se omite).
  | { type: 'permissions_calculator'; id: string; initial_octal?: string; prompt_md?: string }
  | { type: 'checkpoint'; id: string; rule_id?: string; rule_ids?: string[] };

export interface LinuxValidationRule {
  id: string;
  rule_type: string;
  target?: string;
  required: boolean;
  points: number;
}

export interface LinuxModule {
  id: string;
  order: number;
  title: string;
  difficulty: string;
  estimated_minutes?: number;
  sequential: boolean;
  objective: string;
  blocks: LinuxBlock[];
  hints: string[];
  validation_rules: LinuxValidationRule[];
}

export interface LinuxValidationRuleResult {
  rule_id: string;
  rule_type: string;
  passed: boolean;
  points_earned: number;
  details: string;
}

export interface LinuxValidationResult {
  practice_id: string;
  total_points: number;
  earned_points: number;
  percentage: number;
  passed: boolean;
  results: LinuxValidationRuleResult[];
}

// ── Comandos ──────────────────────────────────────────────────────────────────

export const linuxListModules = (): Promise<LinuxPracticeSummary[]> =>
  invoke<LinuxPracticeSummary[]>('practicas_linux_list');

export const linuxGetModule = (practiceId: string): Promise<LinuxModule> =>
  invoke<LinuxModule>('practicas_linux_get_module', { practiceId });

/**
 * `quizAnswers`: mapa question_id -> option_id elegida. Opcional -- los
 * módulos sin bloques `quiz` nunca lo mandan, y un módulo con quiz sin
 * responder todavía simplemente deja esas reglas en `passed: false` (mismo
 * comportamiento "pendiente" que ya tienen los command_step sin ejecutar).
 */
export const linuxValidate = (
  practiceId: string,
  commandHistory: string[],
  quizAnswers?: Record<string, string>,
): Promise<LinuxValidationResult> =>
  invoke<LinuxValidationResult>('practicas_linux_validate', { practiceId, commandHistory, quizAnswers: quizAnswers ?? {} });

/** Host/puerto/usuario para abrir la sesión SSH — la contraseña se pide aparte. */
export const linuxConnectionTarget = (): Promise<LinuxConnectionTarget> =>
  invoke<LinuxConnectionTarget>('practicas_linux_connection_target');

export interface LinuxMedia {
  mime: string;
  /** Base64 estándar -- armar un `data:` URI con esto, ver useLinuxMedia. */
  base64: string;
}

/** Trae un archivo de media (imagen/video) de un módulo, vía el mismo túnel que el resto de la práctica. */
export const linuxGetMedia = (practiceId: string, mediaPath: string): Promise<LinuxMedia> =>
  invoke<LinuxMedia>('practicas_linux_get_media', { practiceId, mediaPath });
