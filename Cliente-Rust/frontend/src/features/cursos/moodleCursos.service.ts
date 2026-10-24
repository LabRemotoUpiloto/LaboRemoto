import { invoke } from '@tauri-apps/api/core';
import type { MisCursos } from '@/bindings/MisCursos';
import type { MoodleCurso } from '@/bindings/MoodleCurso';
import type { MoodlePractica } from '@/bindings/MoodlePractica';
import type { PracticasCurso } from '@/bindings/PracticasCurso';
import type { EntregasPractica } from '@/bindings/EntregasPractica';
import type { EntregaEstudiante } from '@/bindings/EntregaEstudiante';
import type { ResumenCurso } from '@/bindings/ResumenCurso';
import type { RegistroSesion } from './registroSesion';

export type { MisCursos, MoodleCurso, MoodlePractica, PracticasCurso, EntregasPractica, EntregaEstudiante, ResumenCurso };

/**
 * Cursos y prácticas desde Moodle, vía el broker (el cliente nunca ve el token de Moodle).
 * Convención: la práctica `ev3-m3` se vincula a una tarea de Moodle con ID number `labo:ev3-m3`.
 */
export const moodleCursosService = {
  misCursos: () => invoke<MisCursos>('moodle_mis_cursos'),

  practicasDeCurso: (cursoId: number) => invoke<PracticasCurso>('moodle_practicas_curso', { cursoId }),

  /** Vista general del curso: todas las prácticas × todos los estudiantes. Solo docentes del curso. */
  resumenCurso: (cursoId: number) => invoke<ResumenCurso>('moodle_resumen_curso', { cursoId }),

  /** Cómo va cada estudiante en una práctica (estado, nota y fecha). Solo docentes del curso. */
  entregasPractica: (cursoId: number, cmid: number) => invoke<EntregasPractica>('moodle_entregas_practica', { cursoId, cmid }),

  /** Enlace para pegar en la tarea de Moodle: abre la app en esa práctica (página puente del servidor). */
  enlacePractica: (practica: string) => invoke<string>('moodle_enlace_practica', { practica }),

  /**
   * Nota provisional (0–100) «lista para revisar»: el docente decide la nota final en Moodle. Con `registro` (el buffer de la
   * terminal), el registro completo de la sesión viaja como archivo adjunto. Devuelve cómo quedó el registro:
   * 'adjuntado' | 'no_enviado' | 'fallo_la_subida' | 'no_valido' | 'subida_no_disponible'.
   */
  enviarResultado: (cmid: number, nota: number, resumen: string, registro?: RegistroSesion | null) =>
    invoke<string>('moodle_enviar_resultado', { cmid, nota, resumen, registro: registro ?? null }),
};

/** Estado de revisión de una tarea de Moodle, en palabras para el estudiante. */
export function etiquetaEstado(estado: string | null | undefined): string {
  switch (estado) {
    case 'readyforreview': return 'Enviada para revisión';
    case 'inreview': return 'En revisión por el docente';
    case 'readyforrelease':
    case 'released':
    case 'graded': return 'Calificada';
    case 'inmarking': return 'En calificación';
    case 'notgraded':
    case 'notmarked':
    default: return 'Pendiente';
  }
}
