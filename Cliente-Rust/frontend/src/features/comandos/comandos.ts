// features/comandos/comandos.ts — comandos guardados (antes «snippets»): leer, guardar y borrar en el JSON local que maneja
// el backend (cmd/comandos.rs), y pasar una sola vez los que vivían en el navegador (localStorage «user-snippets-v1»).
import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Comando } from '@/bindings/Comando';

export type { Comando };
export type TipoTerminal = 'linux' | 'powershell';

const CLAVE_VIEJA = 'user-snippets-v1';
const CLAVE_MIGRADO = 'user-snippets-v1-migrado';

export const listarComandos = () => invoke<Comando[]>('comandos_listar');
export const guardarComando = (comando: Comando) => invoke<Comando[]>('comandos_guardar', { comando });
export const borrarComando = (id: string) => invoke<Comando[]>('comandos_borrar', { id });

/** Un comando nuevo con lo mínimo; el backend completa id y fecha si faltan. */
export const nuevoComando = (datos: Pick<Comando, 'titulo' | 'comando'> & Partial<Comando>): Comando => ({
  id: crypto.randomUUID(), categoria: null, terminal: null, creado: Date.now(), actualizado: null, ...datos,
});

/** Los snippets que guardaba la página vieja en el navegador, con la forma nueva (`texto`: para probarlo sin navegador). */
export function snippetsDelNavegador(texto?: string | null): Comando[] {
  try {
    const crudo = JSON.parse((texto === undefined ? localStorage.getItem(CLAVE_VIEJA) : texto) || '[]');
    if (!Array.isArray(crudo)) return [];
    return crudo
      .filter((s) => s && typeof s.id === 'string' && typeof s.content === 'string' && s.content.trim())
      .map((s) => ({
        id: s.id, titulo: String(s.title ?? ''), comando: String(s.content), categoria: s.category || null, terminal: null,
        creado: Number(s.createdAt) || Date.now(), actualizado: s.updatedAt ? Number(s.updatedAt) : null,
      }));
  } catch {
    return [];
  }
}

/** Pasa los snippets del navegador al archivo una sola vez (si falla, se reintenta la próxima vez). */
async function migrarSiHaceFalta() {
  try {
    if (localStorage.getItem(CLAVE_MIGRADO)) return;
    const viejos = snippetsDelNavegador();
    if (viejos.length) await invoke<Comando[]>('comandos_importar', { comandos: viejos });
    localStorage.setItem(CLAVE_MIGRADO, '1');
  } catch (e) {
    console.warn('[comandos] no se pudieron pasar los snippets del navegador', e);
  }
}

/** ¿Este comando sirve en esa terminal? Los que no dicen terminal sirven en cualquiera. */
export const sirveEn = (c: Comando, terminal?: TipoTerminal) => !terminal || !c.terminal || c.terminal === terminal;

/** Los comandos guardados, al día: se recargan cuando cualquiera los cambia (otro panel, el chat). */
export function useComandos() {
  const [comandos, setComandos] = useState<Comando[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setComandos(await listarComandos());
      setError(null);
    } catch (e) {
      setError(String(e));
      setComandos((c) => c ?? []);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    let soltar: (() => void) | undefined;
    void migrarSiHaceFalta().then(() => { if (vivo) void recargar(); });
    void listen('comandos:cambio', () => { void recargar(); }).then((u) => { if (vivo) soltar = u; else u(); });
    return () => { vivo = false; soltar?.(); };
  }, [recargar]);

  return { comandos, error, recargar };
}
