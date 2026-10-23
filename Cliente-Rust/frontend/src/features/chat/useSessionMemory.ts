import { useEffect, useMemo, useState } from "react";
import { memGet, memClear, memPut as putSessionMem, type SessionMemPatch } from "@/services/ssh.service";
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
  practiceContext?: string;
  practiceTutorial?: string;
};

const MAX_SNIPPET_LINES = 50;

function mapSessionMem(data: any): SessionMem {
  return {
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
    practiceContext: data.practice_context ?? data.practiceContext,
    practiceTutorial: data.practice_tutorial ?? data.practiceTutorial
  };
}

export function useSessionMemory(sessionId: string | null) {
  const key = useMemo(() => `ssh-copilot:${sessionId ?? "default"}`, [sessionId]);

  const [mem, setMem] = useState<SessionMem>({});

  // Hydrate desde Rust al montar o cambiar de sesión
  useEffect(() => {
    (async () => {
      try {
        const data = await memGet<any>(sessionId ?? "default");
        if (data) {
          setMem(mapSessionMem(data));
        }
      } catch {}
    })();
  }, [sessionId]);

  // Escucha actualizaciones reactivas de memoria de sesión (Rust mem_put)
  useEffect(() => {
    let unlistenUpdated: (() => void) | undefined;
    (async () => {
      try {
        unlistenUpdated = await listen("session:memory-updated", (e: any) => {
          const p = e.payload || {};
          if (p.session_id && p.session_id !== (sessionId ?? "default")) return;
          if (p.mem) {
            setMem(mapSessionMem(p.mem));
          }
        });
      } catch {}
    })();
    return () => { if (unlistenUpdated) unlistenUpdated(); };
  }, [sessionId]);

  // Escucha resultados de terminal (evento de Rust)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
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
      } catch {}
    })();
    return () => { if (unlisten) unlisten(); };
  }, [sessionId]);

  const memPut = async (patch: SessionMemPatch) => {
    await putSessionMem(sessionId ?? "default", patch);
  };

  const setLastFile = async (path: string, content: string, hash?: string) => {
    const snippet = content.split("\n").slice(0, MAX_SNIPPET_LINES).join("\n");
    setMem(m => ({ ...m, lastFile: path, lastFileHash: hash, lastFileSnippet: snippet }));
    await memPut({ last_file: path, last_file_hash: hash, last_file_snippet: snippet });
  };

  const setLastCommand = async (cmd: string) => {
    setMem(m => ({ ...m, lastCommand: cmd }));
    await memPut({ last_command: cmd });
  };

  const setLastPath = async (path: string, kind: 'file' | 'dir') => {
    setMem(m => ({ ...m, lastPath: path, lastPathKind: kind }));
    await memPut({ last_path: path, last_path_kind: kind });
  };

  const noteEnv = async (env: { cwd?: string; shell?: string; os?: string }) => {
    setMem(m => ({ ...m, env: { ...(m.env||{}), ...env } }));
    await memPut({ env_cwd: env.cwd, env_shell: env.shell, env_os: env.os });
  };

  const setPracticeContext = async (context: string, tutorial: string) => {
    setMem(m => ({ ...m, practiceContext: context, practiceTutorial: tutorial }));
    await memPut({ practice_context: context, practice_tutorial: tutorial });
  };

  const clear = async () => {
    setMem({});
    await memClear(sessionId ?? "default");
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
    return parts.length ? `\n\n(Contexto de sesión)\n${parts.join("\n\n")}\n` : "";
  };

  return { mem, setLastFile, setLastCommand, setLastPath, noteEnv, setPracticeContext, buildContextAppendix, clear };
}
