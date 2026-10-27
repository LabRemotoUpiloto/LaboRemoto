// features/conexion/useConectarGuardado.ts — conectar con un clic a un equipo guardado (la contraseña ya viene descifrada
// de `list_hosts_entries`). El resultado llega por los eventos `ssh_connected` / `ssh_connect_error`, igual que en el
// formulario; mientras tanto se muestra el cargador global con «Cancelar».
import { useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLoading } from '@/app/providers/LoadingContext';
import { useToasts } from '@/app/providers/ToastContext';
import { getDeviceLabel } from '@/lib/devices';
import { sshConnect } from './ssh.service';

export function useConectarGuardado(onConnected?: (session: { id: string; label: string }) => void) {
  const [conectando, setConectando] = useState(false);
  const { setLoading } = useLoading();
  const { push } = useToasts();

  const conectar = async (host: string, port: number | string, user = '', password = '') => {
    if (conectando) return;
    const portNum = Number(port);
    const displayName = getDeviceLabel(host, portNum);
    const unlisten = { success: null as (() => void) | null, error: null as (() => void) | null };
    const abortController = new AbortController();

    const cleanup = () => {
      unlisten.success?.();
      unlisten.error?.();
      unlisten.success = null;
      unlisten.error = null;
    };

    const cancelar = () => {
      abortController.abort();
      cleanup();
      setLoading(false, null, null);
      setConectando(false);
      push({ type: 'info', message: 'Conexión cancelada' });
    };

    const conexion = new Promise<string>((resolve, reject) => {
      listen<any>('ssh_connected', (event) => {
        if (event.payload?.id && !abortController.signal.aborted) resolve(event.payload.id);
      }).then((u) => { unlisten.success = u; }).catch(reject);
      listen<any>('ssh_connect_error', (event) => {
        if (!abortController.signal.aborted) reject(new Error(event.payload?.error || 'Error conectando'));
      }).then((u) => { unlisten.error = u; }).catch(reject);
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      setLoading(true, `Conectando a ${displayName}...`, cancelar);
      setConectando(true);
      timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
          cancelar();
          push({ type: 'error', message: 'Tiempo de espera agotado (30 s)' });
        }
      }, 30000);

      await new Promise((r) => setTimeout(r, 100));
      await sshConnect({ host, port: portNum, user, password, cols: 80, rows: 24 });
      if (abortController.signal.aborted) {
        if (timeoutId) clearTimeout(timeoutId);
        cleanup();
        return;
      }

      const sessionId = await conexion;
      if (timeoutId) clearTimeout(timeoutId);
      cleanup();
      onConnected?.({ id: sessionId, label: `${user}@${displayName}` });
      push({ type: 'success', message: `Conectado a ${displayName}` });
      setLoading(false, null, null);
      setConectando(false);
    } catch (e: any) {
      if (timeoutId) clearTimeout(timeoutId);
      cleanup();
      if (!abortController.signal.aborted) {
        push({ type: 'error', message: e?.message || 'Error conectando' });
        setLoading(false, null, null);
        setConectando(false);
      }
    }
  };

  return { conectar, conectando };
}
