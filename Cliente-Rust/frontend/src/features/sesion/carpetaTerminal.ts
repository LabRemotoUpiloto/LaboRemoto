// features/sesion/carpetaTerminal.ts — en qué carpeta está la terminal de una sesión SSH. Lo resuelve el backend leyendo el
// prompt (cmd/ssh/carpeta.rs); null si el prompt no muestra la ruta.
import { invoke } from '@tauri-apps/api/core';

export const carpetaDeLaTerminal = (sessionId: string) => invoke<string | null>('ssh_carpeta_terminal', { id: sessionId });
