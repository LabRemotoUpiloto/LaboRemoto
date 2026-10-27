export interface Transfer {
  id: string
  direction: 'upload' | 'download'
  local_path: string
  remote_path: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  bytes?: number
  total?: number
  message?: string
  session_id?: string
  /** Velocidad promedio en bytes/segundo (ventana móvil), solo mientras corre. */
  speedBps?: number
  /** Tiempo estimado restante en segundos, solo mientras corre. */
  etaSeconds?: number
}
