import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type SessionMem = {
  lastFile?: string;
  lastFileHash?: string;
  lastFileSnippet?: string;
  lastCommand?: string;
  lastStdoutTail?: string;
  lastStderrTail?: string;
  lastExitCode?: number;
  lastPath?: string;
  lastPathKind?: 'file' | 'dir';
  env?: { cwd?: string; shell?: string; os?: string };
  // NUEVO: historial local por sesión (persistido en sessionStorage)
  recentFiles?: string[];
  recentDirs?: string[];
  recentCommands?: string[];
};

type Patch = {
  last_file?: string;
  last_file_hash?: string;
  last_file_snippet?: string;
  last_command?: string;
  last_stdout_tail?: string;
  last_stderr_tail?: string;
  last_exit_code?: number;
  last_path?: string;
  last_path_kind?: string; // 'file' | 'dir'
  env_cwd?: string;
  env_shell?: string;
  env_os?: string;
};

const MAX_SNIPPET_LINES = 50;

export function useSessionMemory(sessionId: string | null) {
  const key = useMemo(() => `ssh-copilot:${sessionId ?? "default"}`, [sessionId]);

  const [mem, setMem] = useState<SessionMem>({});

  const MAX_RECENT = 20;
  const readLocal = (): Partial<SessionMem> => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return {};
      const json = JSON.parse(raw);
      return {
        recentFiles: Array.isArray(json.recentFiles) ? json.recentFiles : [],
        recentDirs: Array.isArray(json.recentDirs) ? json.recentDirs : [],
        recentCommands: Array.isArray(json.recentCommands) ? json.recentCommands : [],
      };
    } catch { return {}; }
  };
  const writeLocal = (update: Partial<SessionMem>) => {
    try {
      const prev = readLocal();
      const next = { ...prev, ...update };
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };

  // Hydrate desde Rust al montar
  useEffect(() => {
    (async () => {
      try {
        const data = await invoke<any>("mem_get", { sessionId: sessionId ?? "default" });
        if (data) {
          const remote: SessionMem = {
            lastFile: data.last_file ?? data.lastFile,
            lastFileHash: data.last_file_hash ?? data.lastFileHash,
            lastFileSnippet: data.last_file_snippet ?? data.lastFileSnippet,
            lastCommand: data.last_command ?? data.lastCommand,
            lastStdoutTail: data.last_stdout_tail ?? data.lastStdoutTail,
            lastStderrTail: data.last_stderr_tail ?? data.lastStderrTail,
            lastExitCode: data.last_exit_code ?? data.lastExitCode,
            lastPath: data.last_path ?? data.lastPath,
            lastPathKind: (data.last_path_kind ?? data.lastPathKind) as 'file' | 'dir' | undefined,
            env: { cwd: data.env_cwd ?? data.env?.cwd, shell: data.env_shell ?? data.env?.shell, os: data.env_os ?? data.env?.os },
          };
          const local = readLocal();
          setMem({ ...remote, ...local });
        }
      } catch {}
    })();
  }, [sessionId]);

  // Escucha resultados de terminal (evento de Rust)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenCwd: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen("copilot/terminal-result", (e: any) => {
          const p = e.payload || {};
          if (p.session_id && p.session_id !== (sessionId ?? "default")) return;
          setMem(m => ({
            ...m,
            lastStdoutTail: p.stdout_tail ?? m.lastStdoutTail,
            lastStderrTail: p.stderr_tail ?? m.lastStderrTail,
            lastExitCode: typeof p.exit_code === "number" ? p.exit_code : m.lastExitCode
          }));
        });
        // Opcional: sincronizar cwd si el backend emite este evento
        try {
          unlistenCwd = await listen("copilot/cwd-changed", (e: any) => {
            const p = e.payload || {};
            if (p.session_id && p.session_id !== (sessionId ?? "default")) return;
            const newCwd = p.cwd as string | undefined;
            if (!newCwd) return;
            setMem(m => ({ ...m, env: { ...(m.env || {}), cwd: newCwd } }));
          });
        } catch {}
      } catch {}
    })();
    return () => { if (unlisten) unlisten(); if (unlistenCwd) unlistenCwd(); };
  }, [sessionId]);

  const memPut = async (patch: Patch) => {
    await invoke("mem_put", { sessionId: sessionId ?? "default", patch });
  };

  const setLastFile = async (path: string, content: string, hash?: string) => {
    const snippet = content.split("\n").slice(0, MAX_SNIPPET_LINES).join("\n");
    setMem(m => {
      const rf = [path, ...(m.recentFiles || []).filter(p => p !== path)].slice(0, MAX_RECENT);
      // si agregamos un archivo, removemos de recentDirs si coincide
      const rd = (m.recentDirs || []).filter(p => p !== path);
      writeLocal({ recentFiles: rf, recentDirs: rd });
      return { ...m, lastFile: path, lastFileHash: hash, lastFileSnippet: snippet, recentFiles: rf, recentDirs: rd };
    });
    await memPut({ last_file: path, last_file_hash: hash, last_file_snippet: snippet });
  };

  const setLastCommand = async (cmd: string) => {
    setMem(m => {
      const rc = [cmd, ...(m.recentCommands || []).filter(c => c !== cmd)].slice(0, MAX_RECENT);
      writeLocal({ recentCommands: rc });
      return { ...m, lastCommand: cmd, recentCommands: rc };
    });
    await memPut({ last_command: cmd });
  };

  const setLastPath = async (path: string, kind: 'file' | 'dir') => {
    setMem(m => {
      let rf = m.recentFiles || [];
      let rd = m.recentDirs || [];
      if (kind === 'file') {
        rf = [path, ...rf.filter(p => p !== path)].slice(0, MAX_RECENT);
        rd = rd.filter(p => p !== path);
      } else {
        rd = [path, ...rd.filter(p => p !== path)].slice(0, MAX_RECENT);
        rf = rf.filter(p => p !== path);
      }
      writeLocal({ recentFiles: rf, recentDirs: rd });
      return { ...m, lastPath: path, lastPathKind: kind, recentFiles: rf, recentDirs: rd };
    });
    await memPut({ last_path: path, last_path_kind: kind });
  };

  const noteEnv = async (env: { cwd?: string; shell?: string; os?: string }) => {
    setMem(m => ({ ...m, env: { ...(m.env||{}), ...env } }));
    await memPut({ env_cwd: env.cwd, env_shell: env.shell, env_os: env.os });
  };

  const clear = async () => {
    setMem({});
    await invoke("mem_clear", { sessionId: sessionId ?? "default" });
    try { sessionStorage.removeItem(key); } catch {}
  };

  const buildContextAppendix = () => {
    const parts: string[] = [];
    if (mem.env?.cwd || mem.env?.shell || mem.env?.os) {
      parts.push(`Entorno: cwd=${mem.env?.cwd ?? "?"}, shell=${mem.env?.shell ?? "?"}, os=${mem.env?.os ?? "?"}`);
    }
    if (mem.lastFile && mem.lastFileSnippet) {
      parts.push(`Último archivo: ${mem.lastFile}${mem.lastFileHash ? ` (sha256:${mem.lastFileHash})` : ""}\nSnippet (primeras 50 líneas):\n${mem.lastFileSnippet}`);
    }
    if (mem.lastStdoutTail || mem.lastStderrTail) {
      parts.push(`Última ejecución: exit=${mem.lastExitCode ?? "N/A"}\nSTDOUT (últimas 15 líneas):\n${(mem.lastStdoutTail ?? "").split("\n").slice(-15).join("\n")}\nSTDERR (últimas 15 líneas):\n${(mem.lastStderrTail ?? "").split("\n").slice(-15).join("\n")}`);
    }
    const rf = (mem.recentFiles || []).slice(0, 5);
    const rd = (mem.recentDirs || []).slice(0, 5);
    if (rf.length) parts.push(`Archivos recientes: ${rf.join(', ')}`);
    if (rd.length) parts.push(`Carpetas recientes: ${rd.join(', ')}`);
    return parts.length ? `\n\n(Contexto de sesión)\n${parts.join("\n\n")}\n` : "";
  };

  return { mem, setLastFile, setLastCommand, setLastPath, noteEnv, buildContextAppendix, clear };
}
