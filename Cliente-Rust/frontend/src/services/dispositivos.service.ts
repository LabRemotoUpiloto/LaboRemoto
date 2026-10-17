import { invoke } from '@tauri-apps/api/core';
import type { ConexionDispositivo } from '../bindings/ConexionDispositivo';
import type { CuentaCompartida } from '../bindings/CuentaCompartida';
import type { CuentaNoReconocida } from '../bindings/CuentaNoReconocida';
import type { DispositivoActividad } from '../bindings/DispositivoActividad';
import type { NoReconocidas } from '../bindings/NoReconocidas';
import type { ResumenDispositivos } from '../bindings/ResumenDispositivos';

export type { ConexionDispositivo, CuentaCompartida, CuentaNoReconocida, DispositivoActividad, NoReconocidas, ResumenDispositivos };

/**
 * Conexiones SSH a los dispositivos (Pi). Solo personal de supervisión; el broker responde 403 al resto. Los datos se
 * recogen desde que arranca el agente de cada dispositivo (no hay historial anterior).
 */
export const dispositivosService = {
  resumen: (dias: number) => invoke<ResumenDispositivos>('dispositivos_resumen', { dias }),
};
