// utils/pendingChatMessage.ts — mensaje del asistente en espera de un ChatPane
// montado para mostrarlo.
//
// Por qué existe: cuando algo fuera del chat necesita inyectarle un mensaje
// (ej. "falta este paquete en el servidor" cuando falla el escritorio
// remoto — ver useDesktopSession.ts) y el panel de chat todavía está
// cerrado, un simple CustomEvent no alcanza: abrir el panel (`isChatOpen`)
// es un cambio de estado async, así que ChatPane recién monta y registra su
// listener DESPUÉS de que el evento ya se disparó y se perdió. Guardar el
// mensaje acá afuera de React deja que ChatPane lo revise apenas se monta,
// sin depender de una carrera de timing.

export interface PendingChatMessage {
  text: string;
  model?: string;
}

let pending: PendingChatMessage | null = null;

export function setPendingChatMessage(msg: PendingChatMessage): void {
  pending = msg;
}

export function consumePendingChatMessage(): PendingChatMessage | null {
  const msg = pending;
  pending = null;
  return msg;
}
