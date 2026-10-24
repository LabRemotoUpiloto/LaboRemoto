// features/sesion/carpetaTerminal.ts — en qué carpeta está la terminal de una sesión SSH, leída del prompt («pi@raspberrypi:~/proyecto $»).
// No hay otra forma confiable de saberlo sin escribir en la terminal de la persona; si el prompt no muestra la ruta, se dice
// que no se sabe en lugar de adivinar.
import { invoke } from '@tauri-apps/api/core';
import { getTerminalContext } from '@/features/chat/ai.service';

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|\r/g;
// usuario@equipo:ruta $   (también «#» de root y el «(venv) » de Python delante)
const PROMPT = /[\w.-]+@[\w.-]+:(~[^\s$#]*|\/[^\s$#]*)\s*[$#]/g;

/** La ruta del último prompt que aparece en `texto` (con `~` si así la muestra), o null. */
export function carpetaDelPrompt(texto: string): string | null {
  const limpio = texto.replace(ANSI, '');
  let ultima: string | null = null;
  for (const m of limpio.matchAll(PROMPT)) ultima = m[1];
  return ultima;
}

/** `~` y `~/x` con la carpeta personal en el servidor. */
export const expandirHome = (ruta: string, home: string) =>
  ruta === '~' ? home : ruta.startsWith('~/') ? `${home.replace(/\/$/, '')}/${ruta.slice(2)}` : ruta;

/** La carpeta absoluta de la terminal de la sesión, o null si el prompt no la muestra. */
export async function carpetaDeLaTerminal(sessionId: string): Promise<string | null> {
  const ruta = carpetaDelPrompt(await getTerminalContext(sessionId, 40));
  if (!ruta) return null;
  if (!ruta.startsWith('~')) return ruta;
  const home = await invoke<string>('sftp_home', { id: sessionId });
  return expandirHome(ruta, home);
}
