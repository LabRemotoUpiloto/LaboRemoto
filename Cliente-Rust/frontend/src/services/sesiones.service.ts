import { invoke } from '@tauri-apps/api/core';
import type { ResumenSesiones } from '../bindings/ResumenSesiones';
import type { SesionPractica } from '../bindings/SesionPractica';

export type { ResumenSesiones, SesionPractica };

export type TipoEventoSesion = 'inicio' | 'latido' | 'fin' | 'ubicacion';

export interface DatosEventoSesion {
  practicaId?: string;
  practicaNombre?: string;
  lat?: number;
  lon?: number;
  precisionM?: number;
}

export const sesionesService = {
  reportarEvento: (tipo: TipoEventoSesion, sesionId: string, datos: DatosEventoSesion = {}) =>
    invoke<void>('sesiones_reportar_evento', { tipo, sesionId, ...datos }),

  resumen: (dias: number) => invoke<ResumenSesiones>('sesiones_resumen', { dias }),
};
