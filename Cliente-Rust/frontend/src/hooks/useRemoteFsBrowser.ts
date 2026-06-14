import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SftpEntry } from "../types";

export type RemoteSortKey = "name" | "mtime" | "size" | "kind";

export type RemoteSort = {
  key: RemoteSortKey;
  dir: "asc" | "desc";
};

export function useRemoteFsBrowser(sessionId?: string, initialPath?: string) {
  const [path, setPath] = useState<string>(initialPath || "/");
  const [rows, setRows] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [sort, setSort] = useState<RemoteSort>({ key: "name", dir: "asc" });
  const [filter, setFilter] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(undefined);
    try {
      await invoke("sftp_open", { id: sessionId });
      const list = await invoke<SftpEntry[]>("sftp_list", { id: sessionId, path });
      setRows(list || []);
    } catch (e: any) {
      const errorMsg = e?.toString?.() || "Error";
      // Si el path no existe, intentar volver al home
      if (errorMsg.includes("no such file") && path !== "/") {
        try {
          const home = await invoke<string>("sftp_home", { id: sessionId });
          if (home && home.length > 1) {
            setPath(home);
            return; // El useEffect de path llamará refresh de nuevo
          }
        } catch {}
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [sessionId, path]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        if (path === "/") {
          const home = await invoke<string>("sftp_home", { id: sessionId });
          if (!cancelled && home && home.length > 1) {
            setPath(home);
            return;
          }
        }
      } catch {}
      if (!cancelled) {
        refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    refresh();
  }, [sessionId, path, refresh]);

  useEffect(() => {
    setSelectedPath(undefined);
    setFilter("");
  }, [path]);

  const display = useMemo(() => {
    const arr = [...rows];
    const cmp = (a: SftpEntry, b: SftpEntry) => {
      const mult = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * mult;
        case "mtime":
          return ((a.mtime || 0) - (b.mtime || 0)) * mult;
        case "size":
          return ((a.size || 0) - (b.size || 0)) * mult;
        case "kind":
          return a.kind.localeCompare(b.kind) * mult;
        default:
          return 0;
      }
    };
    arr.sort(cmp as any);
    const q = (filter || "").trim().toLowerCase();
    if (!q) return arr;
    const toRegex = (s: string) => {
      const esc = s.replace(/[.+^${}()|[\\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
      return new RegExp("^" + esc + "$", "i");
    };
    const rx = q.includes("*") || q.includes("?") ? toRegex(q) : null;
    return arr.filter(e => (rx ? rx.test(e.name) : e.name.toLowerCase().includes(q)));
  }, [rows, sort, filter]);

  return {
    path,
    setPath,
    rows,
    display,
    loading,
    error,
    selectedPath,
    setSelectedPath,
    sort,
    setSort,
    filter,
    setFilter,
    refresh
  };
}

