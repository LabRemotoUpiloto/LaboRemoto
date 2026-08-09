import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Transfer } from "../components/sftp/TransfersPanel";

// Cantidad de muestras de progreso que se conservan por transferencia para
// calcular una velocidad promedio (ventana móvil) que no salte entre eventos.
const SPEED_WINDOW_SIZE = 5;

type ProgressSample = { t: number; bytes: number };

function computeSpeedAndEta(
  samples: ProgressSample[],
  bytes: number,
  total?: number
): { speedBps?: number; etaSeconds?: number } {
  if (samples.length < 2) return {};
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedSeconds = (last.t - first.t) / 1000;
  if (elapsedSeconds <= 0) return {};
  const deltaBytes = last.bytes - first.bytes;
  if (deltaBytes <= 0) return {};
  const speedBps = deltaBytes / elapsedSeconds;
  let etaSeconds: number | undefined;
  if (typeof total === "number" && total > bytes && speedBps > 0) {
    etaSeconds = (total - bytes) / speedBps;
  }
  return { speedBps, etaSeconds };
}

export function useSftpTransfers(sessionId?: string) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  // Ventana móvil de muestras (tiempo, bytes) por id de transferencia, usada
  // solo para calcular velocidad/ETA; no forma parte del estado renderizado.
  const samplesRef = useRef<Map<string, ProgressSample[]>>(new Map());

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let mounted = true;
    listen("sftp_transfer", (e: any) => {
      if (!mounted) return;
      const p = e?.payload || {};
      setTransfers(prev => {
        const next = [...prev];
        const idx = next.findIndex(t => t.id === p.id);
        if (p.type === "started") {
          const initialBytes = typeof p.bytes === "number" ? p.bytes : 0;
          const t: Transfer = {
            id: p.id,
            direction: p.direction,
            session_id: p.session_id,
            remote_path: p.remote_path,
            local_path: p.local_path,
            total: typeof p.total === "number" ? p.total : undefined,
            bytes: initialBytes,
            status: "running"
          };
          samplesRef.current.set(p.id, [{ t: Date.now(), bytes: initialBytes }]);
          if (idx >= 0) next[idx] = t;
          else next.unshift(t);
        } else if (idx >= 0) {
          const cur = next[idx];
          if (cur.status === "cancelled") {
            return next;
          }
          if (p.type === "progress") {
            cur.bytes = typeof p.bytes === "number" ? p.bytes : cur.bytes;
            if (typeof p.total === "number") {
              cur.total = p.total;
            }

            const samples = samplesRef.current.get(cur.id) || [];
            const nextSamples = [...samples, { t: Date.now(), bytes: cur.bytes }].slice(
              -SPEED_WINDOW_SIZE
            );
            samplesRef.current.set(cur.id, nextSamples);
            const { speedBps, etaSeconds } = computeSpeedAndEta(
              nextSamples,
              cur.bytes,
              cur.total
            );
            cur.speedBps = speedBps;
            cur.etaSeconds = etaSeconds;
          } else if (p.type === "done") {
            cur.status = "done";
            cur.speedBps = undefined;
            cur.etaSeconds = undefined;
            samplesRef.current.delete(cur.id);
          } else if (p.type === "canceled") {
            cur.status = "cancelled";
            cur.speedBps = undefined;
            cur.etaSeconds = undefined;
            samplesRef.current.delete(cur.id);
          } else if (p.type === "error") {
            cur.status = "error";
            cur.message = p.message;
            cur.speedBps = undefined;
            cur.etaSeconds = undefined;
            samplesRef.current.delete(cur.id);
          }
          next[idx] = { ...cur };
        }
        return next;
      });
    }).then(unsub => unsubs.push(unsub));
    return () => {
      mounted = false;
      unsubs.forEach(u => u());
    };
  }, []);

  const cancelTransfer = async (transferId: string) => {
    if (!sessionId) return;
    samplesRef.current.delete(transferId);
    setTransfers(prev => {
      const next = [...prev];
      const idx = next.findIndex(t => t.id === transferId);
      if (idx >= 0) {
        next[idx] = { ...next[idx], status: "cancelled", speedBps: undefined, etaSeconds: undefined };
      }
      return next;
    });
    try {
      await invoke("sftp_cancel", { id: sessionId, transferId });
    } catch {}
  };

  const clearCompleted = () => {
    setTransfers(prev => prev.filter(t => t.status === "running"));
  };

  return { transfers, cancelTransfer, clearCompleted };
}

