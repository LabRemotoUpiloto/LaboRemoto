import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

const ERROR_PATTERNS = [
  /bash:.*command not found/i,
  /Failed to (start|restart|stop|reload)/i,
  /Job for .* failed/i,
  /Permission denied/i,
  /No such file or directory/i,
  /fatal:/i,
  /Traceback \(most recent call last\)/i,
  /npm ERR!/i,
  /pip.*[Ee]rror/i,
  /syntax error/i,
  /cannot (access|connect|open|find)/i,
  /\[error\]/i,
  /Error:/,
];
const isPromptLine = (l: string) => l.length < 120 && /[\$#%>]([ \t]{0,3}$|[ \t]\S)/.test(l);

export function useTerminalMonitor(sessionId?: string | null) {
  const [errorBanner, setErrorBanner] = useState<{ snippet: string } | null>(null);
  const [terminalActivity, setTerminalActivity] = useState(false);
  const terminalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen<{ session_id: string }>('terminal:activity', (ev) => {
      if (ev.payload.session_id !== sessionId) return;
      if (terminalDebounceRef.current) clearTimeout(terminalDebounceRef.current);
      terminalDebounceRef.current = setTimeout(async () => {
        setTerminalActivity(true);
        try {
          const ctx = await invoke<string>('get_terminal_context', { sessionId, lines: 40 });
          if (/\x1b\[2J/.test(ctx)) { setErrorBanner(null); return; }
          const stripped = ctx.replace(/\x1b\[[0-9;]*[mGKHFJA-Za-z]/g, '').replace(/\r/g, '');
          const lines = stripped.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length <= 4 && lines.every(l => isPromptLine(l) || l.length < 6)) {
            setErrorBanner(null); return;
          }
          const promptIdxs = lines.reduce<number[]>((acc, l, i) => {
            if (isPromptLine(l)) acc.push(i); return acc;
          }, []);
          if (promptIdxs.length < 2) return;
          const start = promptIdxs[promptIdxs.length - 2];
          const end   = promptIdxs[promptIdxs.length - 1];
          const cmdOutput = lines.slice(start + 1, end);
          let errorFound = false;
          for (const line of cmdOutput) {
            if (ERROR_PATTERNS.some(p => p.test(line))) {
              setErrorBanner({ snippet: line.slice(0, 100) }); errorFound = true; break;
            }
          }
          if (!errorFound && cmdOutput.length > 0) setErrorBanner(null);
        } catch { /* no active session */ }
      }, 1500);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  return { errorBanner, setErrorBanner, terminalActivity, setTerminalActivity };
}
