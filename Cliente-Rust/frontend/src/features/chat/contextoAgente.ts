// features/chat/contextoAgente.ts — lo que el agente necesita saber de la sesión y de la conversación (antes solo recibía el
// mensaje actual): el equipo y el usuario, el tipo de terminal y lo que la persona escribió de cada pin.
import { sshSessionInfo } from '@/features/conexion/ssh.service';
import type { Message } from './modos/types';

/** La conversación anterior, sin mensajes del sistema ni vacíos (el backend la recorta y la ordena). */
export function historialPara(mensajes: Message[]): { rol: 'user' | 'assistant'; texto: string }[] {
  return mensajes
    .filter((m) => (m.sender === 'user' || m.sender === 'ai') && typeof m.text === 'string' && m.text.trim())
    .slice(-12)
    .map((m) => ({ rol: m.sender === 'user' ? 'user' as const : 'assistant' as const, texto: m.text }));
}

/** Descripciones que la persona les puso a los pines en el panel Pines (`{ "17": "LED rojo" }`). */
export function descripcionesDePines(sessionId: string): Record<string, string> {
  try {
    const d = JSON.parse(localStorage.getItem(`pins:descriptions:${sessionId}`) || '{}');
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

export async function contextoDeSesion(sessionId: string): Promise<string> {
  const lineas: string[] = ['Terminal: Linux, por SSH (la terminal interactiva de la persona).'];
  try {
    const info = await sshSessionInfo(sessionId);
    lineas.unshift(`Equipo: ${info.user}@${info.host}:${info.port}`);
  } catch { /* sesión sin datos (p. ej. el agente con la Pi del .env) */ }
  const pines = Object.entries(descripcionesDePines(sessionId)).filter(([, d]) => typeof d === 'string' && d.trim());
  if (pines.length) lineas.push(`Pines descritos por la persona: ${pines.map(([g, d]) => `GPIO ${g} = ${d}`).join('; ')}`);
  return lineas.join('\n');
}
