import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LocalEntry } from "../types";
import { useMultiSelection } from "./useMultiSelection";

export type LocalSortKey = "name" | "mtime" | "size" | "kind";

export type LocalSort = {
  key: LocalSortKey;
  dir: "asc" | "desc";
};

export function useLocalFsBrowser() {
  const [path, setPath] = useState<string>("");
  const [rows, setRows] = useState<LocalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState<string[]>([]);
  const {
    selectedPaths,
    lastSelected,
    selectOnly,
    toggleSelect,
    selectRange,
    selectAll: selectAllPaths,
    clearSelection,
  } = useMultiSelection();
  const [sort, setSort] = useState<LocalSort>({ key: "name", dir: "asc" });
  const [filter, setFilter] = useState<string>("");

  const refresh = useCallback(
    async (nextRoot?: string) => {
      try {
        setLoading(true);
        let root = nextRoot ?? path;
        if (!root) {
          root = await invoke<string>("local_home_dir");
          setPath(root);
        }
        if (drives.length === 0) {
          try {
            const d = await invoke<string[]>("local_list_drives");
            setDrives(d);
          } catch {}
        }
        const list = await invoke<LocalEntry[]>("local_list_dir", { path: root });
        setRows(list || []);
      } finally {
        setLoading(false);
      }
    },
    [path, drives.length]
  );

  // Solo al montar: resuelve el directorio home (path === "") y hace el
  // primer listado. Antes dependía de `[refresh]`, cuya identidad cambia
  // en cuanto `refresh()` resuelve el home y llama `setPath(root)` — eso
  // volvía a disparar este efecto y duplicaba `local_list_drives`/
  // `local_list_dir` en cada apertura del panel local. La navegación
  // posterior ya la disparan explícitamente los callers (ver
  // `handleLocalNavigate` en SftpPage), así que no hace falta reaccionar
  // a cambios de `path` aquí.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    clearSelection();
    setFilter("");
  }, [path, clearSelection]);

  const display = useMemo(() => {
    const arr = [...rows];
    const cmp = (a: LocalEntry, b: LocalEntry) => {
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
    drives,
    selectedPaths,
    lastSelected,
    selectOnly,
    toggleSelect,
    selectRange,
    selectAll: selectAllPaths,
    clearSelection,
    sort,
    setSort,
    filter,
    setFilter,
    refresh
  };
}

