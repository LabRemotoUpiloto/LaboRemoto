// Decisiones sobre cuándo una cámara pasa de WebRTC a HLS y cuándo se vuelve a intentar WebRTC.
//
// Antes, CUALQUIER fallo de WebRTC se tomaba como «esta red no deja pasar el video» y mandaba todas las cámaras a HLS
// durante 2 minutos. Pero cuando MediaMTX cierra la sesión de UNA cámara ya conectada (p. ej. al cambiarle el origen de
// video desde «Administrar cámaras») eso no dice nada de la red, y arrastraba a todas las demás a HLS (6-15 s de retraso).

/** Tras un fallo de red, las cámaras nuevas van directo a HLS este tiempo y luego se vuelve a probar WebRTC. */
export const ESPERA_FALLO_DE_RED_MS = 2 * 60_000

const BASE_MS = 20_000
const TOPE_MS = 5 * 60_000

/**
 * ¿El fallo es de la red (el puerto del video no pasa) y por tanto afecta a todas las cámaras?
 * Solo si la conexión NUNCA llegó a establecerse. Si ya había conectado, es un corte de esa cámara.
 */
export function esFalloDeRed(deRed: boolean, habiaConectado: boolean): boolean {
  return deRed && !habiaConectado
}

/** Espera antes del reintento n (0, 1, 2…) de WebRTC para una cámara que cayó a HLS: 20 s, 40 s, 80 s… hasta 5 min. */
export function esperaReintentoMs(n: number): number {
  return Math.min(TOPE_MS, BASE_MS * 2 ** Math.max(0, n))
}
