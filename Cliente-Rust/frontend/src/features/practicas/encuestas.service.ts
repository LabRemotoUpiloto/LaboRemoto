import { invoke } from '@tauri-apps/api/core';
import type { RespuestasEncuesta } from '@/bindings/RespuestasEncuesta';
import type { ResumenEncuestas } from '@/bindings/ResumenEncuestas';
import type { ResumenPracticaEncuesta } from '@/bindings/ResumenPracticaEncuesta';

export type { RespuestasEncuesta, ResumenEncuestas, ResumenPracticaEncuesta };

/** Encuesta al terminar una práctica completa (ver cmd::encuestas e infra/broker-sesiones/encuestas.js). */
export const encuestasService = {
  enviar: (practica: string, respuestas: RespuestasEncuesta) => invoke<void>('encuestas_enviar', { practica, respuestas }),
  /** ¿Ya la respondió (en cualquier equipo)? */
  mia: (practica: string) => invoke<boolean>('encuestas_mia', { practica }),
  /** Resumen anónimo; solo supervisión. */
  resumen: (dias: number) => invoke<ResumenEncuestas>('encuestas_resumen', { dias }),
};

export const DIFICULTADES = [
  { value: 'muy_facil', label: 'Muy fácil' },
  { value: 'facil', label: 'Fácil' },
  { value: 'adecuada', label: 'Adecuada' },
  { value: 'dificil', label: 'Difícil' },
  { value: 'muy_dificil', label: 'Muy difícil' },
] as const;

export const PROBLEMAS = [
  { value: 'ninguno', label: 'Ninguno' },
  { value: 'lentitud', label: 'Lentitud' },
  { value: 'desconexiones', label: 'Se desconectó' },
  { value: 'terminal', label: 'La terminal no respondía' },
  { value: 'camara', label: 'La cámara no se veía' },
  { value: 'guia', label: 'La guía no avanzaba' },
  { value: 'otro', label: 'Otro' },
] as const;

/** «Ninguno» es excluyente: elegirlo quita los demás, y elegir otro quita «Ninguno». */
export function alternarProblema(actuales: string[], valor: string): string[] {
  if (valor === 'ninguno') return actuales.includes('ninguno') ? [] : ['ninguno'];
  const sin = actuales.filter((p) => p !== 'ninguno');
  return sin.includes(valor) ? sin.filter((p) => p !== valor) : [...sin, valor];
}

/** Borrador del formulario: lo que falta por responder (vacío = se puede enviar). */
export interface BorradorEncuesta {
  aprendizaje: number | null;
  claridad: number | null;
  dificultad: string | null;
  asistente: number | 'no_uso' | null;
  funcionamiento: number | null;
  problemas: string[];
  satisfaccion: number | null;
  gusto: string;
  mejorar: string;
}

export const BORRADOR_VACIO: BorradorEncuesta = {
  aprendizaje: null, claridad: null, dificultad: null, asistente: null, funcionamiento: null, problemas: [], satisfaccion: null, gusto: '', mejorar: '',
};

/** Las respuestas listas para enviar, o `null` si falta alguna obligatoria (los dos comentarios son opcionales). */
export function respuestasDe(b: BorradorEncuesta): RespuestasEncuesta | null {
  if (b.aprendizaje == null || b.claridad == null || b.dificultad == null || b.asistente == null
    || b.funcionamiento == null || b.satisfaccion == null || b.problemas.length === 0) return null;
  return {
    aprendizaje: b.aprendizaje, claridad: b.claridad, funcionamiento: b.funcionamiento, satisfaccion: b.satisfaccion,
    asistente: b.asistente, dificultad: b.dificultad, problemas: b.problemas, gusto: b.gusto.trim(), mejorar: b.mejorar.trim(),
  };
}
