// features/chat/ejecutorTerminal.ts — en la terminal local, «Ejecutar» de los bloques de código del chat escribe en el
// panel de terminal activo (no hay sesión SSH). Lo da ChatPane; sin él, los bloques usan la sesión SSH como siempre.
import { createContext } from 'react';

export const EjecutorTerminal = createContext<((comando: string) => void) | null>(null);
