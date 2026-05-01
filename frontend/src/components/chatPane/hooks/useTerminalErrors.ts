import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ERROR_PATTERNS } from '../chatPane.constants';

const isPromptLine = (l: string) => /[$#%>]\s{0,3}$/.test(l) && l.length < 120;

export interface TerminalErrorState {
  errorBanner: { snippet: string } | null;
  setErrorBanner: (v: { snippet: string } | null) => void;
  terminalActivity: boolean;
  setTerminalActivity: (v: boolean) => void;
}

export function useTerminalErrors(sessionId: string | null): TerminalErrorState {
  const [errorBanner, setErrorBanner] = useState<{ snippet: string } | null>(null);
  const [terminalActivity, setTerminalActivity] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Escuchar ssh_out en tiempo real — `clear` descarta el banner al instante
  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen<string>(`ssh_out_${sessionId}`, (ev) => {
      if (ev.payload && /\x1b\[2J/.test(ev.payload)) {
        setErrorBanner(null);
        setTerminalActivity(false);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  // Escuchar actividad de terminal — debounce 1.5 s, analizar salida del último comando
  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen<{ session_id: string }>('terminal:activity', (ev) => {
      if (ev.payload.session_id !== sessionId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setTerminalActivity(true);
        try {
          const ctx = await invoke<string>('get_terminal_context', { sessionId, lines: 40 });

          if (/\x1b\[2J/.test(ctx)) { setErrorBanner(null); return; }

          const stripped = ctx
            .replace(/\x1b\[[0-9;]*[mGKHFJA-Za-z]/g, '')
            .replace(/\r/g, '');
          const lines = stripped.split('\n').map(l => l.trim()).filter(Boolean);

          // Contenido mínimo → clear reciente
          if (lines.length <= 4 && lines.every(l => isPromptLine(l) || l.length < 6)) {
            setErrorBanner(null);
            return;
          }

          const promptIdxs = lines.reduce<number[]>((acc, l, i) => {
            if (isPromptLine(l)) acc.push(i);
            return acc;
          }, []);

          // Necesitamos al menos 2 prompts para analizar el output de un comando completo
          if (promptIdxs.length < 2) return;

          const start = promptIdxs[promptIdxs.length - 2];
          const end   = promptIdxs[promptIdxs.length - 1];
          const cmdOutput = lines.slice(start + 1, end);

          let errorFound = false;
          for (const line of cmdOutput) {
            if (ERROR_PATTERNS.some(p => p.test(line))) {
              setErrorBanner({ snippet: line.slice(0, 100) });
              errorFound = true;
              break;
            }
          }
          if (!errorFound && cmdOutput.length > 0) setErrorBanner(null);
        } catch { /* sin sesión activa */ }
      }, 1500);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  return { errorBanner, setErrorBanner, terminalActivity, setTerminalActivity };
}
