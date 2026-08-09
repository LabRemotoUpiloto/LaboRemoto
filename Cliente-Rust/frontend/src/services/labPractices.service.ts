/**
 * labPractices.service.ts
 *
 * Capa de servicio para el catálogo externo de prácticas
 * (cmd::integration::lab_practices). Solo lectura.
 *
 * IMPORTANTE: `ExternalLabPractice` es contenido NO confiable (puede venir
 * de una aplicación de autoría de terceros). Nunca trae host/usuario/
 * contraseña — solo `execution_requirements` declarativos. Vincular una
 * práctica importada a un entorno de laboratorio real (host/credenciales
 * locales) es una decisión explícita y local que todavía no existe en el
 * cliente (fase siguiente).
 */

import { invoke } from '@tauri-apps/api/core';
import type { ExternalLabPractice } from '../bindings/ExternalLabPractice';

export type { ExternalLabPractice };

/** Lista el catálogo de prácticas publicadas (caché de 5 min en el backend). */
export const labPracticesList = (): Promise<ExternalLabPractice[]> =>
  invoke<ExternalLabPractice[]>('lab_practices_list');

/** Consulta una práctica externa por id. */
export const labPracticesGet = (id: string): Promise<ExternalLabPractice> =>
  invoke<ExternalLabPractice>('lab_practices_get', { id });
