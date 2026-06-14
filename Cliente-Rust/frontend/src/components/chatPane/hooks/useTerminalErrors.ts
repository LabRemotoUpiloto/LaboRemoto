import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  analyzeTerminalContext,
  terminalContextLooksClean,
} from '../../../utils/terminalErrorAnalysis';

const ANALYZE_DELAY_MS = 900;

export interface TerminalErrorState {
  errorBanner: { snippet: string; hint?: string } | null;
  setErrorBanner: (v: { snippet: string; hint?: string } | null) => void;
  terminalActivity: boolean;
  setTerminalActivity: (v: boolean) => void;
}

export function useTerminalErrors(sessionId: string | null): TerminalErrorState {
  const [errorBanner, setErrorBanner] = useState<{ snippet: string; hint?: string } | null>(null);
  const [terminalActivity, setTerminalActivity] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const analyzeBuffer = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    try {
      const ctx = await invoke<string>('get_terminal_context', { sessionId: id, lines: 80 });
      if (/\x1b\[2J/.test(ctx)) {
        setErrorBanner(null);
        setTerminalActivity(false);
        return;
      }
      const insight = analyzeTerminalContext(ctx);
      if (insight) {
        setErrorBanner(insight);
        setTerminalActivity(true);
        return;
      }
      setTerminalActivity(true);
      setErrorBanner(prev => (terminalContextLooksClean(ctx) ? null : prev));
    } catch {
      /* sin sesión activa */
    }
  }, []);

  const scheduleAnalyze = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void analyzeBuffer();
    }, ANALYZE_DELAY_MS);
  }, [analyzeBuffer]);

  useEffect(() => {
    if (!sessionId) {
      setErrorBanner(null);
      setTerminalActivity(false);
      return;
    }

    const unlistenOut = listen<string>(`ssh_out_${sessionId}`, (ev) => {
      if (ev.payload && /\x1b\[2J/.test(ev.payload)) {
        setErrorBanner(null);
        setTerminalActivity(false);
        return;
      }
      setTerminalActivity(true);
      scheduleAnalyze();
    });

    const unlistenActivity = listen<{ session_id: string }>('terminal:activity', (ev) => {
      if (ev.payload.session_id !== sessionId) return;
      setTerminalActivity(true);
      scheduleAnalyze();
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unlistenOut.then(fn => fn());
      unlistenActivity.then(fn => fn());
    };
  }, [sessionId, scheduleAnalyze]);

  return { errorBanner, setErrorBanner, terminalActivity, setTerminalActivity };
}
