// hooks/usePtzControl.ts
// Envía comandos PTZ (mover/zoom/detener) a una cámara vía el backend
// (cmd::nvr::shinobi::nvr_ptz_control), que a su vez pasa por el broker en
// la Pi -- nunca se habla directo con la cámara Reolink desde el cliente.
import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type PtzOp =
  | 'Left' | 'Right' | 'Up' | 'Down'
  | 'LeftUp' | 'LeftDown' | 'RightUp' | 'RightDown'
  | 'ZoomInc' | 'ZoomDec' | 'Stop'

export function usePtzControl(groupKey: string | null) {
  const sendPtz = useCallback((mid: string, op: PtzOp, speed?: number) => {
    if (!groupKey) return
    invoke('nvr_ptz_control', { groupKey, mid, op, speed }).catch((e) => {
      console.error('[ptz] error enviando comando:', e)
    })
  }, [groupKey])

  return { sendPtz }
}
