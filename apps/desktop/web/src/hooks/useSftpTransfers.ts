import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Transfer } from "../components/sftp/TransfersPanel";

export function useSftpTransfers(sessionId?: string) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);

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
          const t: Transfer = {
            id: p.id,
            direction: p.direction,
            session_id: p.session_id,
            remote_path: p.remote_path,
            local_path: p.local_path,
            total: typeof p.total === "number" ? p.total : undefined,
            bytes: typeof p.bytes === "number" ? p.bytes : 0,
            status: "running"
          };
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
          } else if (p.type === "done") {
            cur.status = "done";
          } else if (p.type === "canceled") {
            cur.status = "cancelled";
          } else if (p.type === "error") {
            cur.status = "error";
            cur.message = p.message;
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
    setTransfers(prev => {
      const next = [...prev];
      const idx = next.findIndex(t => t.id === transferId);
      if (idx >= 0) {
        next[idx] = { ...next[idx], status: "cancelled" };
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

