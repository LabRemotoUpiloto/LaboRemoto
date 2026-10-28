// features/registros/registros.service.ts — registros de la terminal de cada intento de práctica, guardados en la Pi
// (backend: cmd/registros.rs; servidor: infra/broker-sesiones/registros.js).
import { invoke } from '@tauri-apps/api/core';
import type { ListaRegistros } from '@/bindings/ListaRegistros';
import type { RegistroIntento } from '@/bindings/RegistroIntento';
import type { RegistroSesion } from '@/features/cursos/registroSesion';

export type { ListaRegistros, RegistroIntento };

export type EstadoIntento = 'terminada' | 'sin_terminar' | 'app_cerrada';

/** Un intento listo para guardar o mandar: la práctica, cómo terminó y el buffer crudo de su terminal. */
export interface IntentoPractica {
  id: string;
  practica: string;
  practicaNombre: string | null;
  estado: EstadoIntento;
  inicio: string;
  nota: number | null;
  registro: RegistroSesion;
}

/** Evento de Rust al pedir cerrar la ventana: hay que mandar los intentos abiertos y luego llamar a `cerrarApp`. */
export const EVENTO_CERRANDO = 'app:cerrando';

export const registrosService = {
  /** Deja (o actualiza) la copia del intento en este equipo, sin mandarla. */
  guardarCopia: (intento: IntentoPractica) => invoke<void>('registros_guardar_copia', { intento }),
  /** «enviado», «pendiente» (queda la copia para después) o «rechazado». */
  enviarIntento: (intento: IntentoPractica) => invoke<'enviado' | 'pendiente' | 'rechazado'>('registros_enviar_intento', { intento }),
  /** Manda lo que quedó en este equipo de la persona con sesión iniciada; devuelve cuántos llegaron. */
  enviarPendientes: () => invoke<number>('registros_enviar_pendientes'),
  listar: (dias?: number) => invoke<ListaRegistros>('registros_listar', { dias }),
  archivo: (carpeta: string, id: string) => invoke<string>('registros_archivo', { carpeta, id }),
  cerrarApp: () => invoke<void>('app_cerrar'),
};
