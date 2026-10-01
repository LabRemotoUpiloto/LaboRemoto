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

// ── Bloques interactivos de los módulos de EV3 ──
// Son widgets de exploración libre, sin regla de validación: la app trae el
// componente y el módulo (en la API) solo lo configura con estos datos.

export interface CalcInput {
  id: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  default: number;
}

export interface CalcOutput {
  id: string;
  label: string;
  /** Fórmula aritmética sobre los ids de `inputs` y de `outputs` anteriores (ver utils/mathExpr). */
  expr: string;
  decimals?: number;
  unit?: string;
}

/** Zona de distancia del sensor ultrasónico: aplica hasta `max_cm` (la última puede omitirlo). */
export interface SensorZone {
  max_cm?: number;
  label: string;
  action: string;
}

export interface MachineState {
  id: string;
  label: string;
}

export interface MachineEvent {
  id: string;
  label: string;
  from: string;
  to: string;
}

export type LinuxBlock =
  | { type: 'text'; id: string; body_md: string }
  // Simulador de dos ruedas (potencia izquierda/derecha -> qué hace el robot).
  | { type: 'wheels_sim'; id: string; title?: string }
  // Calculadora configurable; `code_template` usa {id} de entradas y salidas.
  | {
      type: 'calculator';
      id: string;
      title?: string;
      inputs: CalcInput[];
      outputs: CalcOutput[];
      code_template?: string;
      note_md?: string;
    }
  // Simulación de un sensor; si hay uno real conectado se muestra su valor.
  // `code_template` usa {value} y {threshold}.
  | {
      type: 'sensor_demo';
      id: string;
      sensor: 'touch' | 'ultrasonic' | 'color';
      title?: string;
      threshold_cm?: number;
      zones?: SensorZone[];
      code_template?: string;
    }
  | { type: 'state_machine'; id: string; title?: string; states: MachineState[]; events: MachineEvent[]; initial: string }
  | { type: 'checklist'; id: string; title?: string; items: string[]; done_md?: string }
  | { type: 'terminal_annotation'; id: string; prompt_example: string; labels: LinuxLabel[] }
  // Fragmento de código solo para leer (módulos de EV3: Python). No tiene regla de validación.
  | { type: 'code_block'; id: string; language?: string; code: string; caption?: string }
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

/**
 * Entorno que un módulo necesita además de la terminal y el chat (hoy: el
 * robot de EV3). Todo opcional: los módulos de Linux no traen `environment`.
 * Nunca lleva credenciales -- las comandos de arranque usan scripts que ya
 * tienen sus claves del lado de la Pi.
 */
export interface LinuxModuleEnvironment {
  /** Paneles que se abren junto a la terminal al conectar. */
  panels?: { robot_dashboard?: boolean; camera?: boolean };
  /** Pasos de arranque; el backend los valida y los ejecuta por la sesión SSH del estudiante. */
  setup_commands?: string[];
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
  environment?: LinuxModuleEnvironment;
}

/** Los módulos de EV3 usan el prefijo `ev3-` (mismo criterio que `module_category` en Rust). */
export const isEv3Module = (moduleId: string): boolean => moduleId.startsWith('ev3-');

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

/**
 * Prepara el entorno del módulo (ej. levanta el servidor del robot y su
 * puente) por la sesión SSH ya abierta. Devuelve una línea por paso. El
 * backend trae los comandos él mismo: acá solo se dice qué módulo es.
 */
export const practicasModuleSetup = (sessionId: string, practiceId: string): Promise<string[]> =>
  invoke<string[]>('practicas_module_setup', { sessionId, practiceId });

export interface LinuxMedia {
  mime: string;
  /** Base64 estándar -- armar un `data:` URI con esto, ver useLinuxMedia. */
  base64: string;
}

/**
 * URL local (puente del backend, loopback + token aleatorio) desde la que un `<video>` lee el archivo
 * por streaming con `Range`: arranca en segundos y no baja lo que el estudiante no mira. Se usa para
 * video; las imágenes, que son chicas, siguen yendo por `linuxGetMedia`.
 */
export const linuxGetMediaUrl = (practiceId: string, mediaPath: string): Promise<string> =>
  invoke<string>('practicas_linux_media_url', { practiceId, mediaPath });

/** Trae un archivo de media (imagen/video) de un módulo, vía el mismo túnel que el resto de la práctica. */
// Caché en memoria por (módulo, archivo): el mismo video/imagen se pedía de nuevo
// cada vez que el bloque se remontaba (navegar entre pestañas, re-render del
// chat) y cada pedido es un archivo completo por el túnel de la Pi. Se guarda
// la promesa, así varios bloques que piden lo mismo a la vez comparten un solo
// pedido; si falla no se cachea el error, el siguiente intento reintenta.
const mediaCache = new Map<string, Promise<LinuxMedia>>();

export const linuxGetMedia = (practiceId: string, mediaPath: string): Promise<LinuxMedia> => {
  const key = `${practiceId}/${mediaPath}`;
  const cached = mediaCache.get(key);
  if (cached) return cached;
  const pedido = invoke<LinuxMedia>('practicas_linux_get_media', { practiceId, mediaPath });
  mediaCache.set(key, pedido);
  pedido.catch(() => { if (mediaCache.get(key) === pedido) mediaCache.delete(key); });
  return pedido;
};
