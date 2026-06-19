/**
 * useUpdateCheck.ts
 *
 * Gestiona la detección e instalación de actualizaciones de la app (Tauri updater).
 * Extraído de App.tsx para separar esta responsabilidad del shell principal.
 */

import { useState, useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  notes?: string;
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);

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
    try {
      setUpdating(true);
      const upd = await check();
      if (upd) {
        await upd.downloadAndInstall();
        await relaunch();
      } else {
        setUpdateInfo(null);
      }
    } catch {
      setUpdateInfo(null);
    } finally {
      setUpdating(false);
    }
  };

  const dismissUpdate = () => setUpdateInfo(null);

  return { updateInfo, updating, confirmInstallUpdate, dismissUpdate };
}
