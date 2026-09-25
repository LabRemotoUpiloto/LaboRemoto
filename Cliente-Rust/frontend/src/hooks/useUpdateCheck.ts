/**
 * useUpdateCheck.ts
 *
 * Gestiona la detección e instalación de actualizaciones de la app (Tauri updater).
 * Extraído de App.tsx para separar esta responsabilidad del shell principal.
 */

import { useState, useEffect, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  notes?: string;
}

export type UpdatePhase = 'downloading' | 'installing' | 'relaunching';

export interface UpdateProgress {
  phase: UpdatePhase;
  downloaded: number;
  /** null si el servidor no informó el tamaño total (no se puede calcular %). */
  total: number | null;
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  // El plugin de Tauri no expone un AbortController real para una descarga
  // en curso -- "cancelar" acá es un cancel suave: oculta la pantalla y evita
  // el relaunch forzado, pero la descarga puede seguir terminando sola en
  // segundo plano. Por eso solo se ofrece mientras se está descargando, nunca
  // una vez que empezó a instalar (ahí ya sería arriesgado).
  const cancelledRef = useRef(false);

  // Verificar actualizaciones al montar (una sola vez)
  useEffect(() => {
    (async () => {
      try {
        const upd = await check();
        if (upd) {
          setUpdateInfo({ version: upd.version, notes: upd.body });
        }
      } catch {
        // Silencioso: no hay conexión, o el servidor de updates no está disponible
      }
    })();
  }, []);

  const confirmInstallUpdate = async () => {
    if (!updateInfo) return;
    cancelledRef.current = false;
    try {
      setUpdating(true);
      // Estado inicial para que la pantalla aparezca ya mismo -- si esperamos
      // al primer evento 'Started' del downloader queda un hueco en blanco
      // entre apretar el botón y que se vea algo.
      setUpdateProgress({ phase: 'downloading', downloaded: 0, total: null });
      const upd = await check();
      if (upd) {
        let downloaded = 0;
        let total: number | null = null;
        await upd.downloadAndInstall(event => {
          if (cancelledRef.current) return;
          switch (event.event) {
            case 'Started':
              total = event.data.contentLength ?? null;
              setUpdateProgress({ phase: 'downloading', downloaded: 0, total });
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              setUpdateProgress({ phase: 'downloading', downloaded, total });
              break;
            case 'Finished':
              // downloadAndInstall sigue trabajando después de este evento
              // (aplica el instalador) antes de resolver la promesa -- no hay
              // eventos para esa parte, así que queda como fase indeterminada.
              setUpdateProgress({ phase: 'installing', downloaded: total ?? downloaded, total });
              break;
          }
        });
        if (cancelledRef.current) return;
        setUpdateProgress(prev => ({ phase: 'relaunching', downloaded: prev?.downloaded ?? 0, total: prev?.total ?? null }));
        await relaunch();
      } else {
        setUpdateInfo(null);
      }
    } catch {
      if (!cancelledRef.current) setUpdateInfo(null);
    } finally {
      if (!cancelledRef.current) {
        setUpdating(false);
        setUpdateProgress(null);
      }
    }
  };

  // Cancel suave: solo tiene sentido mientras se está descargando (ver nota
  // de cancelledRef arriba). Oculta la pantalla ya mismo; el flag evita que
  // el 'Finished' que llegue después fuerce el relaunch.
  const cancelUpdate = () => {
    cancelledRef.current = true;
    setUpdating(false);
    setUpdateProgress(null);
  };

  const dismissUpdate = () => setUpdateInfo(null);

  return { updateInfo, updating, updateProgress, confirmInstallUpdate, cancelUpdate, dismissUpdate };
}
