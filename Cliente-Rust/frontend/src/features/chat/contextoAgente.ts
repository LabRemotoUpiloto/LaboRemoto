// features/chat/contextoAgente.ts — lo que el agente necesita de la app: la conversación anterior y lo que solo la app sabe
// de la sesión (las descripciones de los pines). El equipo, el usuario y el tipo de terminal los pone el backend.
import type { Message } from './modos/types';

/** La conversación anterior, sin mensajes del sistema ni vacíos (el backend la recorta y la ordena). */
export function historialPara(mensajes: Message[]): { rol: 'user' | 'assistant'; texto: string }[] {
  return mensajes
    .filter((m) => (m.sender === 'user' || m.sender === 'ai') && typeof m.text === 'string' && m.text.trim())
    .slice(-12)
    .map((m) => ({ rol: m.sender === 'user' ? 'user' as const : 'assistant' as const, texto: m.text }));
}

/** Descripciones que la persona les puso a los pines en el panel Pines (`{ "17": "LED rojo" }`), como línea de contexto. */
export function contextoDePines(sessionId: string): string {
  try {
    const d = JSON.parse(localStorage.getItem(`pins:descriptions:${sessionId}`) || '{}');
    const pines = Object.entries(d && typeof d === 'object' ? d : {}).filter(([, v]) => typeof v === 'string' && (v as string).trim());
    return pines.length ? `Pines descritos por la persona: ${pines.map(([g, v]) => `GPIO ${g} = ${v}`).join('; ')}` : '';
  } catch {
    return '';
  }
}
