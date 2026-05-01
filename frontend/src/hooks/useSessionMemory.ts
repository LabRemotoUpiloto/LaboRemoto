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
  practiceContext?: string;
  practiceTutorial?: string;
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
  practice_context?: string;
  practice_tutorial?: string;
};

const MAX_SNIPPET_LINES = 50;

export function useSessionMemory(sessionId: string | null) {
  const key = useMemo(() => `ssh-copilot:${sessionId ?? "default"}`, [sessionId]);

  const [mem, setMem] = useState<SessionMem>({});

  // Hydrate desde Rust al montar
  useEffect(() => {
    (async () => {
      try {
        const data = await invoke<any>("mem_get", { sessionId: sessionId ?? "default" });
        if (data) {
          setMem({
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
          });
        }
      } catch {}
    })();
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

  const memPut = async (patch: Patch) => {
    await invoke("mem_put", { sessionId: sessionId ?? "default", patch });
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
    return parts.length ? `\n\n(Contexto de sesión)\n${parts.join("\n\n")}\n` : "";
  };

  return { mem, setLastFile, setLastCommand, setLastPath, noteEnv, setPracticeContext, buildContextAppendix, clear };
}
