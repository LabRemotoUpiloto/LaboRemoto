/**
 * useSftpSession.ts — hook público de orquestación de la sesión de transferencias SFTP.
 *
 * REFACTOR #4 (Batch 4): envuelve `useSftpTransfers` (que ya tenía un buen patrón
 * de registro/limpieza de listener Tauri) en un hook de lifecycle consistente con
 * el patrón establecido en Batch 2 para el terminal (`components/terminal/useTerminal.ts`):
 * un hook delgado de orquestación, documentado, con un único contrato público.
 *
 * A diferencia de `useTerminal`, `useSftpTransfers` no necesitó descomponerse en
 * varios sub-hooks (su único efecto ya tiene una sola responsabilidad clara:
 * escuchar el evento `sftp_transfer` y proyectarlo a estado). Por eso este hook
 * es una capa de composición/documentación delgada sobre él, no una fachada de
 * múltiples sub-hooks.
 *
 * ── Decisión de estado: Zustand vs. local ───────────────────────────────────
 * El estado de transferencias (`transfers`) permanece interno al hook (useState
 * dentro de `useSftpTransfers`), NO se migra a un slice de Zustand.
 * Motivo (mismo criterio que Batch 2 para el terminal): a día de hoy el único
 * consumidor es `SftpPage.tsx` (una sola instancia montada a la vez), que pasa
 * `transfers` hacia abajo por props a `TransferQueue`. No hay ningún otro punto
 * de la UI que necesite leer la lista de transferencias de forma independiente.
 * Si en el futuro se agrega, p. ej., un widget global de progreso visible fuera
 * de `SftpPage`, ese es el momento de extraer un slice `store/sftp.ts` siguiendo
 * el patrón de `store/app.ts` (Batch 1/3) — no antes, para evitar estado global
 * innecesario.
 *
 * ── Notas de timing (lección aplicada de Batch 2) ───────────────────────────
 * El listener `sftp_transfer` se registra una única vez (deps `[]`, dentro de
 * `useSftpTransfers`) y vive durante todo el ciclo de vida del hook, sin
 * depender de `sessionId`: cada evento trae su propio `session_id` en el
 * payload y las transferencias se identifican por `transfer.id`, no por la
 * sesión activa en la UI. Esto es intencional: cambiar de sesión SFTP activa no
 * cancela ni pierde transferencias en curso de otras sesiones.
 * `cancelTransfer`, en cambio, sí depende de `sessionId`, pero lo lee en el
 * momento de la llamada (dentro del callback), no en el cuerpo de un efecto —
 * evita el bug de timing encontrado en Batch 2 (ref/valor leído en el momento
 * de registro del efecto en vez de en el momento de disparo del evento).
 *
 * ── Contrato público (preservado exactamente respecto a `useSftpTransfers`) ─
 * `{ transfers, cancelTransfer, clearCompleted }`
 */
import { useSftpTransfers } from './useSftpTransfers'

export function useSftpSession(sessionId?: string) {
  const { transfers, cancelTransfer, clearCompleted } = useSftpTransfers(sessionId)

  return { transfers, cancelTransfer, clearCompleted }
}
