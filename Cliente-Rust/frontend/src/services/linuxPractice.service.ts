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

export type LinuxBlock =
  | { type: 'text'; id: string; body_md: string }
  | { type: 'terminal_annotation'; id: string; prompt_example: string; labels: LinuxLabel[] }
  | { type: 'analogy'; id: string; term: string; everyday: string; windows: string; linux: string }
  | { type: 'command_step'; id: string; command: string; explain_md: string }
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

export const linuxValidate = (
  practiceId: string,
  commandHistory: string[],
): Promise<LinuxValidationResult> =>
  invoke<LinuxValidationResult>('practicas_linux_validate', { practiceId, commandHistory });

/** Host/puerto/usuario para abrir la sesión SSH — la contraseña se pide aparte. */
export const linuxConnectionTarget = (): Promise<LinuxConnectionTarget> =>
  invoke<LinuxConnectionTarget>('practicas_linux_connection_target');
