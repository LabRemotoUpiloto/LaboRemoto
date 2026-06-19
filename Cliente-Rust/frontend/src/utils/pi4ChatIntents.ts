import type { AgentStep } from '../components/chatModes/types';

/** Palabras que indican escritorio gráfico VNC (no terminal SSH). */
function mentionsPi4Desktop(t: string): boolean {
  return (
    /\bescritorio(\s+remoto|\s+gr[aá]fico)?\b/.test(t) ||
    /\b(remote\s+desktop|vnc|gui|lxde|entorno gr[aá]fico|interfaz gr[aá]fica|pantalla gr[aá]fica|modo gr[aá]fico)\b/.test(t)
  );
}

/** El usuario pide entrar o trabajar en la Raspberry Pi 4 (terminal SSH, no VNC). */
export function isPi4AccessIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isPi4DesktopIntent(text) || isPi4CamerasIntent(text)) return false;
  return (
    /\b(pi\s*4|pi4|raspberry|raspi)\b/.test(t) &&
    /\b(entra|entrar|entremos|entreme|conecta|conectar|conectemos|conéctate|accede|acceder|abre|abrir|abramos|abrí|abrirme|vamos|llévame|llevame|ssh|accedamos)\b/.test(t)
  ) || /\b((entra|abre|abrir|conecta)(r|mos|me)?\s+(a\s+)?(la\s+)?(pi|pi4|raspberry))\b/.test(t);
}

/** El usuario pide el escritorio gráfico (VNC) de la Pi — no la terminal. */
export function isPi4DesktopIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (!mentionsPi4Desktop(t)) return false;
  // "escritorio remoto" / "abre el escritorio" sin mencionar pi explícita
  if (/\bescritorio\s+remoto\b/.test(t)) return true;
  const action =
    /\b(abre|abrir|abramos|abr[íi]|abrirme|abreme|abrime|muestra|mostrar|ver|enseña|enseñame|dame|pon|ponme|quiero|necesito|usa|usar|inicia|iniciar|lanza|conecta|conectar|conéctame|ll[eé]vame|llevame|vamos|entra|entrar)\b/.test(t);
  const pi = /\b(pi\s*4|pi4|raspberry|raspi|labo|laboratorio)\b/.test(t);
  return action || pi || /\b(remoto|remota)\b/.test(t);
}

/** El usuario pide ver las cámaras de la Pi. */
export function isPi4CamerasIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/\b(muestra(r|me)?|mostrar|ver|abre|abrir|enseña|enseñame|listar|dame)\b/.test(t) && /\b(c[aá]maras?|cameras?|streams?)\b/.test(t)) {
    return true;
  }
  if (/\b(c[aá]maras?\s+activas?|video(s)?\s+de\s+la\s+(pi|raspi|raspberry))\b/.test(t)) {
    return true;
  }
  return /\b(pi\s*4|pi4|raspberry|raspi)\b/.test(t) && /\b(c[aá]maras?|cameras?)\b/.test(t);
}

/** El agente verificó conexión exitosa con la tool conectar_raspberry. */
export function agentOpenedPi4(steps?: AgentStep[]): boolean {
  if (!steps?.length) return false;
  return steps.some(
    s =>
      s.kind === 'tool_result' &&
      s.name === 'conectar_raspberry' &&
      typeof s.output === 'string' &&
      (s.output.includes('CONEXION OK') || s.output.includes('Conectado a')),
  );
}

export function shouldOpenPi4ChatDesktop(userMessage: string, _steps?: AgentStep[]): boolean {
  if (isPi4CamerasIntent(userMessage)) return false;
  return isPi4DesktopIntent(userMessage);
}

export function shouldOpenPi4ChatTerminal(userMessage: string, _steps?: AgentStep[]): boolean {
  if (isPi4CamerasIntent(userMessage)) return false;
  if (isPi4DesktopIntent(userMessage)) return false;
  // Solo terminal si el usuario lo pidió explícitamente — no porque conectar_raspberry haya tenido éxito
  return isPi4AccessIntent(userMessage);
}

export function shouldOpenPi4ChatCameras(userMessage: string, _steps?: AgentStep[]): boolean {
  return isPi4CamerasIntent(userMessage);
}
